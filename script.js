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

let hostFile = null; // Персонаж хоста
let guestFile = null; // Персонаж гостя

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
                const answerDesc = JSON.parse(ans);
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

    const offer = await localConnection.createOffer();
    await localConnection.setLocalDescription(offer);

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

    const offerDesc = JSON.parse(remoteOffer);
    await remoteConnection.setRemoteDescription(offerDesc);

    const answer = await remoteConnection.createAnswer();
    await remoteConnection.setLocalDescription(answer);

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

    const hostIndex = Math.floor(Math.random() * characters.length);
    const guestIndex = (hostIndex + 1) % characters.length;

    hostFile = characters[hostIndex];
    guestFile = characters[guestIndex];
    myCharacterFile = isHost ? hostFile : guestFile;

    dataChannel.send(JSON.stringify({ type: 'set', set: chosenSet, chars: characters }));
    dataChannel.send(JSON.stringify({ type: 'assign', myCharacter: isHost ? guestFile : hostFile }));

    renderGameBoards();
}

function renderGameBoards() {
    const myContainer = document.getElementById('my-character-container');
    myContainer.innerHTML = '';
    myContainer.appendChild(createCharCard(myCharacterFile));

    const oppBoard = document.getElementById('opponent-characters');
    oppBoard.innerHTML = '';
    characters.forEach((char) => {
        const div = createCharCard(char);
        const button = document.createElement('button');
        button.textContent = 'Выбрать персонажа';
        button.onclick = () => makeGuess(char);
        div.appendChild(button);

        oppBoard.appendChild(div);
    });
}

function createCharCard(fileName) {
    const div = document.createElement('div');
    div.classList.add('char');
    const img = document.createElement('img');
    img.src = `packs/${chosenSet}/${fileName}`;
    const p = document.createElement('p');
    p.textContent = fileName.replace(/\..+$/, '');
    div.appendChild(img);
    div.appendChild(p);
    return div;
}

function makeGuess(characterFile) {
    if (!gameOver && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({ type: 'guess', characterName: characterFile }));
    }
}

function endGame(guessedCorrectly) {
    gameOver = true;
    const result = guessedCorrectly ? 'guesser' : 'defender';
    const guesserIsHost = !isHost;

    dataChannel.send(JSON.stringify({
        type: 'guessResult',
        result,
        guesserIsHost,
        yourCharacterFile: isHost ? hostFile : guestFile,
        opponentCharacterFile: isHost ? guestFile : hostFile
    }));

    showGameResult(result, guesserIsHost, isHost ? hostFile : guestFile, isHost ? guestFile : hostFile);
}

function showGameResult(result, guesserIsHost, yourChar, oppChar) {
    const resultDiv = document.getElementById('game-result');
    resultDiv.style.display = 'block';

    const finalYourChar = document.getElementById('final-your-char');
    finalYourChar.innerHTML = '';
    finalYourChar.appendChild(createCharCard(yourChar));

    const finalOppChar = document.getElementById('final-opp-char');
    finalOppChar.innerHTML = '';
    finalOppChar.appendChild(createCharCard(oppChar));
}
