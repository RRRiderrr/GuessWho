const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

let localConnection;
let remoteConnection;
let dataChannel;
let chosenSet = null;
let characters = [];
let isHost = false;
let myCharacterFile = null;
let gameOver = false;

let hostFile = null;
let guestFile = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('packs.json');
        const data = await response.json();

        const setSelect = document.getElementById('set-select');
        data.sets.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.name;
            opt.textContent = s.name;
            opt.dataset.chars = JSON.stringify(s.characters);
            setSelect.appendChild(opt);
        });

        document.getElementById('host-btn').addEventListener('click', () => {
            document.getElementById('setup-screen').style.display = 'none';
            document.getElementById('host-setup').style.display = 'block';
            isHost = true;
        });

        document.getElementById('join-btn').addEventListener('click', () => {
            document.getElementById('setup-screen').style.display = 'none';
            document.getElementById('join-setup').style.display = 'block';
            isHost = false;
        });

        document.getElementById('host-start').addEventListener('click', async () => {
            const select = document.getElementById('set-select');
            chosenSet = select.value;
            characters = JSON.parse(select.selectedOptions[0].dataset.chars);
            await startHost();
        });

        document.getElementById('join-start').addEventListener('click', async () => {
            const remoteOffer = document.getElementById('remote-offer').value;
            if (!remoteOffer) return;
            await startGuest(remoteOffer);
        });

        document.getElementById('copy-desc').addEventListener('click', () => {
            const desc = document.getElementById('local-desc');
            desc.select();
            document.execCommand('copy');
        });

        document.getElementById('apply-answer').addEventListener('click', async () => {
            const ans = document.getElementById('remote-answer').value;
            if (!ans) return;
            try {
                const parsedAnswer = JSON.parse(ans);
                console.log("Получен answer:", parsedAnswer);

                if (parsedAnswer.type !== 'answer') {
                    console.error("Неверный тип SDP: ожидается 'answer'.");
                    return;
                }

                await localConnection.setRemoteDescription(parsedAnswer);
                console.log("Answer успешно применён.");
                checkIfReady();

            } catch (e) {
                console.error("Ошибка при применении answer:", e);
            }
        });

        document.getElementById('ask-btn').addEventListener('click', () => {
            const question = document.getElementById('question').value.trim();
            if (question && dataChannel && dataChannel.readyState === 'open' && !gameOver) {
                dataChannel.send(JSON.stringify({ type: 'question', text: question }));
                document.getElementById('status').textContent = "Вы спросили: " + question;
            }
        });

        document.getElementById('restart-btn').addEventListener('click', () => {
            startNewRound();
        });

    } catch (e) {
        console.error("Ошибка при загрузке packs.json:", e);
    }
});

async function startHost() {
    localConnection = new RTCPeerConnection(rtcConfig);

    dataChannel = localConnection.createDataChannel("gameChannel");
    dataChannel.onopen = onDataChannelOpen;
    dataChannel.onmessage = onDataChannelMessage;

    await createOfferWithCompleteICE(localConnection);

    console.log("Offer создан:", localConnection.localDescription);

    document.getElementById('host-setup').style.display = 'none';
    document.getElementById('signal-exchange').style.display = 'block';
    document.getElementById('local-desc').value = JSON.stringify(localConnection.localDescription);

    document.getElementById('host-accept-answer').style.display = 'block';
}

async function startGuest(remoteOffer) {
    remoteConnection = new RTCPeerConnection(rtcConfig);

    remoteConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        dataChannel.onopen = onDataChannelOpen;
        dataChannel.onmessage = onDataChannelMessage;
    };

    const parsedOffer = JSON.parse(remoteOffer);
    console.log("Получен offer:", parsedOffer);

    await remoteConnection.setRemoteDescription(parsedOffer);
    console.log("Remote description для гостя установлено.");

    await createAnswerWithCompleteICE(remoteConnection);

    console.log("Answer создан:", remoteConnection.localDescription);

    document.getElementById('join-setup').style.display = 'none';
    document.getElementById('signal-exchange').style.display = 'block';
    document.getElementById('local-desc').value = JSON.stringify(remoteConnection.localDescription);
}

function onDataChannelOpen() {
    console.log('Data channel открыт!');
    checkIfReady();
}

function onDataChannelMessage(event) {
    const msg = JSON.parse(event.data);
    console.log("Получено сообщение:", msg);

    if (msg.type === 'set') {
        chosenSet = msg.set;
        characters = msg.chars;
        console.log("Набор персонажей установлен:", characters);
    } else if (msg.type === 'assign') {
        myCharacterFile = msg.myCharacter;
        console.log("Мой персонаж назначен:", myCharacterFile);
        renderGameBoards();
    } else if (msg.type === 'question') {
        document.getElementById('status').textContent = "Противник спрашивает: " + msg.text;
    } else if (msg.type === 'guess') {
        const guessedCorrectly = (msg.character === myCharacterFile);
        endGame(guessedCorrectly);
    } else if (msg.type === 'guessResult') {
        showGameResult(msg.result, msg.yourCharacter, msg.opponentCharacter);
    }
}

function checkIfReady() {
    console.log("Проверка готовности соединения:");
    console.log("Remote description:", localConnection?.remoteDescription);
    console.log("Data channel состояние:", dataChannel?.readyState);

    if (isHost && localConnection.remoteDescription && dataChannel.readyState === 'open') {
        console.log("Хост готов. Назначение персонажей...");
        assignCharacters();
    }
}

function assignCharacters() {
    let hostIndex = Math.floor(Math.random() * characters.length);
    let guestIndex = Math.floor(Math.random() * characters.length);

    while (hostIndex === guestIndex) {
        guestIndex = Math.floor(Math.random() * characters.length);
    }

    hostFile = characters[hostIndex];
    guestFile = characters[guestIndex];

    myCharacterFile = isHost ? hostFile : guestFile;

    console.log("Хост персонаж:", hostFile);
    console.log("Гость персонаж:", guestFile);

    dataChannel.send(JSON.stringify({ type: 'set', set: chosenSet, chars: characters }));
    dataChannel.send(JSON.stringify({ type: 'assign', myCharacter: isHost ? guestFile : hostFile }));

    renderGameBoards();
}

function renderGameBoards() {
    console.log("Отрисовка игровых досок...");
    const myContainer = document.getElementById('my-character-container');
    const oppBoard = document.getElementById('opponent-characters');

    myContainer.innerHTML = '';
    oppBoard.innerHTML = '';

    myContainer.appendChild(createCharCard(myCharacterFile));
    characters.forEach(char => {
        const charCard = createCharCard(char);
        const guessBtn = document.createElement('button');
        guessBtn.textContent = "Выбрать персонажа";
        guessBtn.onclick = () => makeGuess(char);
        charCard.appendChild(guessBtn);
        oppBoard.appendChild(charCard);
    });
}

function createCharCard(char) {
    const div = document.createElement('div');
    div.className = 'char';
    const img = document.createElement('img');
    img.src = `packs/${chosenSet}/${char}`;
    div.appendChild(img);
    return div;
}

function makeGuess(character) {
    if (!gameOver) {
        console.log("Догадка отправлена:", character);
        dataChannel.send(JSON.stringify({ type: 'guess', character }));
    }
}

function endGame(guessedCorrectly) {
    const result = guessedCorrectly ? "win" : "lose";
    const yourCharacter = myCharacterFile;
    const opponentCharacter = isHost ? guestFile : hostFile;

    dataChannel.send(JSON.stringify({ type: 'guessResult', result, yourCharacter, opponentCharacter }));
    showGameResult(result, yourCharacter, opponentCharacter);
}

function showGameResult(result, yourCharacter, opponentCharacter) {
    console.log("Результат игры:", result);
    const resultMessage = document.getElementById('result-message');
    const yourCharContainer = document.getElementById('final-your-char');
    const oppCharContainer = document.getElementById('final-opp-char');

    resultMessage.textContent = result === "win" ? "Вы угадали персонажа!" : "Вы проиграли.";
    yourCharContainer.innerHTML = '';
    oppCharContainer.innerHTML = '';

    yourCharContainer.appendChild(createCharCard(yourCharacter));
    oppCharContainer.appendChild(createCharCard(opponentCharacter));

    document.getElementById('game-board').style.display = 'none';
    document.getElementById('game-result').style.display = 'block';
}

function startNewRound() {
    console.log("Начало нового раунда...");
    gameOver = false;
    assignCharacters();
    renderGameBoards();
}

async function createOfferWithCompleteICE(pc) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForICEGatheringComplete(pc);
}

async function createAnswerWithCompleteICE(pc) {
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForICEGatheringComplete(pc);
}

function waitForICEGatheringComplete(pc) {
    return new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
            resolve();
        } else {
            const checkState = () => {
                if (pc.iceGatheringState === 'complete') {
                    pc.removeEventListener('icegatheringstatechange', checkState);
                    resolve();
                }
            };
            pc.addEventListener('icegatheringstatechange', checkState);
        }
    });
}
