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
let myCharacter = null;
let gameOver = false;

let offerDesc = null;
let answerDesc = null;

let hostSecret = null;
let guestSecret = null;

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
                dataChannel.send(JSON.stringify({type:'question', text:question}));
                document.getElementById('status').textContent = "Вы спросили: " + question;
            }
        });

        document.getElementById('restart-btn').addEventListener('click', () => {
            // Новый раунд без переподключения
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
        myCharacter = msg.myCharacter;
        renderGameBoards();
    } else if (msg.type === 'question') {
        document.getElementById('status').textContent = "Противник спрашивает: " + msg.text;
    } else if (msg.type === 'guess') {
        const guessedCharacter = msg.characterName;
        const guessedCorrectly = (guessedCharacter === myCharacter);
        endGame(guessedCorrectly);
    } else if (msg.type === 'guessResult') {
        // Т.к. теперь передаем персонажей в guessResult, гарантируем корректный показ итога
        gameOver = true;
        showGameResult(msg.result, msg.guesserIsHost, msg.yourCharacter, msg.opponentCharacter);
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
    const hostIndex = Math.floor(Math.random() * characters.length);
    const guestIndex = Math.floor(Math.random() * characters.length);
    
    hostSecret = characters[hostIndex].replace(/\..+$/, '');
    guestSecret = characters[guestIndex].replace(/\..+$/, '');
    
    myCharacter = isHost ? hostSecret : guestSecret; 

    dataChannel.send(JSON.stringify({type:'set', set:chosenSet, chars: characters}));
    dataChannel.send(JSON.stringify({type:'assign', myCharacter: (isHost ? guestSecret : hostSecret)}));

    renderGameBoards();
}

function renderGameBoards() {
    document.getElementById('signal-exchange').style.display = 'none';
    document.getElementById('host-accept-answer').style.display = 'none';
    document.getElementById('game-board').style.display = 'block';
    document.getElementById('game-result').style.display = 'none';

    // Мой персонаж
    const myContainer = document.getElementById('my-character-container');
    myContainer.innerHTML = '';
    myContainer.appendChild(createCharCard(myCharacter));

    // Персонажи оппонента
    const oppBoard = document.getElementById('opponent-characters');
    oppBoard.innerHTML = '';
    characters.forEach(c => {
        const name = c.replace(/\..+$/, '');
        const div = createCharCard(name);
        const guessBtn = document.createElement('button');
        guessBtn.textContent = "Выбрать персонажа";
        guessBtn.className = 'guess-btn';
        guessBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (gameOver) return;
            makeGuess(name);
        });
        div.appendChild(guessBtn);

        div.addEventListener('click', () => {
            if (gameOver) return;
            div.classList.toggle('hidden');
        });

        oppBoard.appendChild(div);
    });
}

function createCharCard(charName) {
    const div = document.createElement('div');
    div.className = 'char';
    const img = document.createElement('img');
    const cFile = characters.find(c => c.replace(/\..+$/, '') === charName);
    img.src = cFile ? `packs/${chosenSet}/${cFile}` : '';
    const p = document.createElement('p');
    p.textContent = charName;
    div.appendChild(img);
    div.appendChild(p);
    return div;
}

function makeGuess(characterName) {
    if (!gameOver && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({type:'guess', characterName: characterName}));
    }
}

function endGame(guessedCorrectly) {
    gameOver = true;
    // Я - defender (кто получил guess)
    const result = guessedCorrectly ? 'guesser' : 'defender';
    const guesserIsHost = !isHost;

    // Гарантируем корректные данные о персонажах для итога
    const yourChar = isHost ? hostSecret : guestSecret;
    const oppChar = isHost ? guestSecret : hostSecret;

    dataChannel.send(JSON.stringify({
        type: 'guessResult',
        result: result,
        guesserIsHost: guesserIsHost,
        yourCharacter: yourChar,
        opponentCharacter: oppChar
    }));

    showGameResult(result, guesserIsHost, yourChar, oppChar);
}

function showGameResult(result, guesserIsHost, yourChar, oppChar) {
    gameOver = true;
    document.getElementById('game-board').style.display = 'none';
    document.getElementById('game-result').style.display = 'block';

    const iAmGuesser = (guesserIsHost === isHost);

    let msg;
    if (result === 'guesser') {
        // Guesser угадал
        if (iAmGuesser) {
            msg = "Вы угадали персонажа оппонента!";
        } else {
            msg = "Оппонент угадал вашего персонажа! Вы проиграли.";
        }
    } else {
        // Defender выиграл
        if (iAmGuesser) {
            msg = "Вы не угадали персонажа оппонента! Вы проиграли.";
        } else {
            msg = "Оппонент не угадал вашего персонажа! Вы выиграли.";
        }
    }

    document.getElementById('result-message').textContent = msg;

    const finalYourChar = document.getElementById('final-your-char');
    finalYourChar.innerHTML = '';
    finalYourChar.appendChild(createCharCard(yourChar));

    const finalOppChar = document.getElementById('final-opp-char');
    finalOppChar.innerHTML = '';
    finalOppChar.appendChild(createCharCard(oppChar));
}

function startNewRound() {
    // Начинаем новый раунд без переподключения
    gameOver = false;
    assignCharacters(); // Снова назначаем персонажей и отрисовываем доску
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
