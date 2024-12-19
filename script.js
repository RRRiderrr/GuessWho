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
let myCharacterFile = null; // Персонаж текущего игрока
let gameOver = false;

let offerDesc = null;
let answerDesc = null;

let hostFile = null; // Персонаж хоста
let guestFile = null; // Персонаж гостя
let playerName = ''; // Псевдоним игрока

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Псевдоним игрока
        const nicknameInput = document.getElementById('nickname');
        const startGameBtn = document.getElementById('start-game-btn');

        startGameBtn.addEventListener('click', () => {
            const nickname = nicknameInput.value.trim();
            if (nickname === '') {
                alert('Введите псевдоним!');
                return;
            }
            playerName = nickname;
            document.getElementById('nickname-screen').style.display = 'none';
            document.getElementById('setup-screen').style.display = 'block';
        });

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
                answerDesc = JSON.parse(ans);
                if (answerDesc.type !== 'answer') {
                    throw new Error("Неверный тип SDP, ожидается answer");
                }
                await localConnection.setRemoteDescription(answerDesc);
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

    offerDesc = JSON.parse(remoteOffer);
    if (offerDesc.type !== 'offer') {
        console.error("Некорректный SDP, ожидается offer");
        return;
    }
    await remoteConnection.setRemoteDescription(offerDesc);

    await createAnswerWithCompleteICE(remoteConnection);

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
    if (msg.type === 'set') {
        chosenSet = msg.set;
        characters = msg.chars;
    } else if (msg.type === 'assign') {
        myCharacterFile = msg.myCharacter;
        renderGameBoards();
    } else if (msg.type === 'question') {
        document.getElementById('status').textContent = "Противник спрашивает: " + msg.text;
    } else if (msg.type === 'guess') {
        const guessedCharacter = msg.characterName;
        const guessedCorrectly = (guessedCharacter === myCharacterFile);
        endGame(guessedCorrectly);
    } else if (msg.type === 'guessResult') {
        gameOver = true;
        showGameResult(msg.result, msg.guesserIsHost, msg.yourCharacterFile, msg.opponentCharacterFile);
    }
}

function checkIfReady() {
    if (isHost) {
        if (localConnection.remoteDescription && dataChannel && dataChannel.readyState === 'open') {
            assignCharacters();
        }
    }
}

function assignCharacters() {
    if (characters.length < 2) {
        console.error("В наборе слишком мало персонажей!");
        return;
    }

    let hostIndex = Math.floor(Math.random() * characters.length);
    let guestIndex = Math.floor(Math.random() * characters.length);
    while (guestIndex === hostIndex) {
        guestIndex = Math.floor(Math.random() * characters.length);
    }

    hostFile = characters[hostIndex];
    guestFile = characters[guestIndex];

    myCharacterFile = isHost ? hostFile : guestFile;

    dataChannel.send(JSON.stringify({ type: 'set', set: chosenSet, chars: characters }));
    dataChannel.send(JSON.stringify({ type: 'assign', myCharacter: (isHost ? guestFile : hostFile) }));

    renderGameBoards();
}

function renderGameBoards() {
    console.log("Рендеринг досок начат...");

    document.getElementById('signal-exchange').style.display = 'none';
    document.getElementById('host-accept-answer').style.display = 'none';
    document.getElementById('game-board').style.display = 'block';
    document.getElementById('game-result').style.display = 'none';

    const myContainer = document.getElementById('my-character-container');
    myContainer.innerHTML = '';
    myContainer.appendChild(createCharCard(myCharacterFile));

    const oppBoard = document.getElementById('opponent-characters');
    oppBoard.innerHTML = '';
    characters.forEach(c => {
        const div = createCharCard(c);

        const guessBtn = document.createElement('button');
        guessBtn.textContent = "Выбрать персонажа";
        guessBtn.className = 'guess-btn';
        guessBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (gameOver || div.classList.contains('disabled')) return;
            makeGuess(c);
        });

        div.addEventListener('click', () => {
            if (gameOver) return;
            div.classList.toggle('disabled');
            const btn = div.querySelector('.guess-btn');
            btn.disabled = div.classList.contains('disabled');
        });

        div.appendChild(guessBtn);
        oppBoard.appendChild(div);
    });
}

function createCharCard(fileName) {
    const div = document.createElement('div');
    div.className = 'char';
    const img = document.createElement('img');
    img.src = `packs/${chosenSet}/${fileName}`;
    img.alt = fileName;
    const p = document.createElement('p');
    p.textContent = fileName.replace(/\..+$/, '');
    div.appendChild(img);
    div.appendChild(p);
    return div;
}

function makeGuess(characterFile) {
    if (!gameOver && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({ type: 'guess', characterName: characterFile }));
    }
}

function endGame(guessedCorrectly) {
    gameOver = true;
    const result = guessedCorrectly ? 'guesser' : 'defender';
    const guesserIsHost = !isHost;

    const yourCharFile = isHost ? hostFile : guestFile;
    const oppCharFile = isHost ? guestFile : hostFile;

    dataChannel.send(JSON.stringify({
        type: 'guessResult',
        result: result,
        guesserIsHost: guesserIsHost,
        yourCharacterFile: yourCharFile,
        opponentCharacterFile: oppCharFile
    }));

    showGameResult(result, guesserIsHost, yourCharFile, oppCharFile);
}

function showGameResult(result, guesserIsHost, yourCharFile, oppCharFile) {
    document.getElementById('game-board').style.display = 'none';
    document.getElementById('game-result').style.display = 'block';

    const iAmGuesser = (guesserIsHost === isHost);

    let msg;
    if (result === 'guesser') {
        msg = iAmGuesser
            ? "Вы выиграли! Вы угадали персонажа оппонента."
            : "Вы проиграли! Оппонент угадал вашего персонажа.";
    } else {
        msg = iAmGuesser
            ? "Вы проиграли! Вы не угадали персонажа оппонента."
            : "Вы выиграли! Оппонент не угадал вашего персонажа.";
    }

    document.getElementById('result-message').textContent = msg;

    const finalYourChar = document.getElementById('final-your-char');
    finalYourChar.innerHTML = '';
    finalYourChar.appendChild(createCharCard(yourCharFile));

    const finalOppChar = document.getElementById('final-opp-char');
    finalOppChar.innerHTML = '';
    finalOppChar.appendChild(createCharCard(oppCharFile));
}

function startNewRound() {
    console.log("Начинаем новый раунд...");
    gameOver = false;

    assignCharacters();
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
    return new Promise(resolve => {
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
