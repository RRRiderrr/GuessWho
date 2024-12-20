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
let currentRoundHostFile = null;
let currentRoundGuestFile = null;

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

        document.getElementById('restart-btn').addEventListener('click', () => {
            startNewRound();
            if (dataChannel && dataChannel.readyState === 'open') {
                dataChannel.send(JSON.stringify({ type: 'restart' }));
            }
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
    checkIfReady();
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
        currentRoundHostFile = msg.hostFile;
        currentRoundGuestFile = msg.guestFile;
        renderGameBoards();
    } else if (msg.type === 'assign') {
        myCharacterFile = msg.myCharacter;
        renderGameBoards();
    } else if (msg.type === 'guessResult') {
        gameOver = true;
        showGameResult(msg.result, msg.guesserIsHost, msg.currentRoundHostFile, msg.currentRoundGuestFile);
    } else if (msg.type === 'restart') {
        startNewRound();
    }
}

function checkIfReady() {
    if (isHost) {
        if (localConnection.remoteDescription && dataChannel && dataChannel.readyState === 'open') {
            assignCharacters();
        }
    } else {
        if (remoteConnection.localDescription && dataChannel && dataChannel.readyState === 'open') {
            renderGameBoards();
        }
    }
}

function assignCharacters() {
    if (characters.length < 2) {
        console.error("В наборе слишком мало персонажей!");
        return;
    }

    const hostIndex = Math.floor(Math.random() * characters.length);
    let guestIndex = Math.floor(Math.random() * characters.length);
    while (guestIndex === hostIndex) {
        guestIndex = Math.floor(Math.random() * characters.length);
    }

    currentRoundHostFile = characters[hostIndex];
    currentRoundGuestFile = characters[guestIndex];

    hostFile = currentRoundHostFile;
    guestFile = currentRoundGuestFile;

    myCharacterFile = isHost ? hostFile : guestFile;

    dataChannel.send(JSON.stringify({
        type: 'set',
        set: chosenSet,
        chars: characters,
        hostFile: currentRoundHostFile,
        guestFile: currentRoundGuestFile
    }));

    renderGameBoards();
}

function renderGameBoards() {
    document.getElementById('signal-exchange').style.display = 'none';
    document.getElementById('game-board').style.display = 'block';
    document.getElementById('game-result').style.display = 'none';

    const myContainer = document.getElementById('my-character-container');
    myContainer.innerHTML = '';
    if (myCharacterFile) {
        myContainer.appendChild(createCharCard(myCharacterFile));
    }

    const oppBoard = document.getElementById('opponent-characters');
    oppBoard.innerHTML = '';
    characters.forEach(c => {
        if (!c) return;
        const div = createCharCard(c);

        const guessBtn = document.createElement('button');
        guessBtn.textContent = "Выбрать персонажа";
        guessBtn.className = 'guess-btn';
        guessBtn.addEventListener('click', () => {
            if (gameOver) return;
            makeGuess(c);
        });

        div.appendChild(guessBtn);
        oppBoard.appendChild(div);
    });
}

function createCharCard(fileName) {
    if (!fileName) {
        const placeholder = document.createElement('div');
        placeholder.textContent = "Нет данных";
        return placeholder;
    }

    const div = document.createElement('div');
    div.className = 'char';
    const img = document.createElement('img');
    img.src = `packs/${chosenSet}/${fileName}`;
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

function showGameResult(result, guesserIsHost, hostChar, guestChar) {
    document.getElementById('game-board').style.display = 'none';
    document.getElementById('game-result').style.display = 'block';

    const msg = result === 'guesser'
        ? "Вы выиграли!"
        : "Вы проиграли!";

    document.getElementById('result-message').textContent = msg;

    const finalYourChar = document.getElementById('final-your-char');
    finalYourChar.innerHTML = '';
    if (hostChar) {
        finalYourChar.appendChild(createCharCard(isHost ? hostChar : guestChar));
    }

    const finalOppChar = document.getElementById('final-opp-char');
    finalOppChar.innerHTML = '';
    if (guestChar) {
        finalOppChar.appendChild(createCharCard(isHost ? guestChar : hostChar));
    }
}

function startNewRound() {
    gameOver = false;
    assignCharacters();
}
