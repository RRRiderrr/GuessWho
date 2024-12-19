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

function showScreen(screenId) {
    const screens = document.querySelectorAll('.container');
    screens.forEach(screen => screen.style.display = 'none');
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        showScreen('nickname-screen');

        document.getElementById('start-game-btn').addEventListener('click', () => {
            const nickname = document.getElementById('nickname').value.trim();
            if (nickname) {
                playerName = nickname;
                showScreen('setup-screen');
            } else {
                alert('Введите ваш псевдоним!');
            }
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
            showScreen('host-setup');
            isHost = true;
        });

        document.getElementById('join-btn').addEventListener('click', () => {
            showScreen('join-setup');
            isHost = false;
        });

        document.getElementById('host-start').addEventListener('click', async () => {
            const select = document.getElementById('set-select');
            chosenSet = select.value;
            characters = JSON.parse(select.selectedOptions[0].dataset.chars);
            await startHost();
            showScreen('signal-exchange');
        });

        document.getElementById('join-start').addEventListener('click', async () => {
            const remoteOffer = document.getElementById('remote-offer').value;
            if (!remoteOffer) {
                alert('Введите предложение от хоста!');
                return;
            }

            try {
                const parsedOffer = JSON.parse(remoteOffer);
                await startGuest(parsedOffer);
                showScreen('signal-exchange');
            } catch (error) {
                alert('Некорректное предложение. Убедитесь, что вы вставили правильные данные.');
                console.error("Ошибка парсинга JSON:", error);
            }
        });

        document.getElementById('apply-answer').addEventListener('click', async () => {
            const answerText = document.getElementById('remote-answer').value;
            if (!answerText) return;

            try {
                const answerDesc = JSON.parse(answerText);
                await localConnection.setRemoteDescription(answerDesc);
                checkIfReady();
                showScreen('game-board');
            } catch (error) {
                console.error("Ошибка при обработке answer:", error);
            }
        });

        document.getElementById('restart-btn').addEventListener('click', () => {
            if (dataChannel && dataChannel.readyState === 'open') {
                dataChannel.send(JSON.stringify({ type: 'restart' }));
            }
            restartGame();
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

    document.getElementById('local-desc').value = JSON.stringify(localConnection.localDescription);
}

async function startGuest(remoteOffer) {
    try {
        remoteConnection = new RTCPeerConnection(rtcConfig);

        remoteConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            dataChannel.onopen = onDataChannelOpen;
            dataChannel.onmessage = onDataChannelMessage;
        };

        await remoteConnection.setRemoteDescription(remoteOffer);

        const answer = await remoteConnection.createAnswer();
        await remoteConnection.setLocalDescription(answer);

        document.getElementById('local-desc').value = JSON.stringify(remoteConnection.localDescription);
    } catch (error) {
        console.error("Ошибка при обработке remoteOffer:", error);
    }
}

function onDataChannelOpen() {
    console.log("Data channel открыт!");
    checkIfReady();
}

function onDataChannelMessage(event) {
    try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'set') {
            chosenSet = msg.set;
            characters = msg.chars;
        } else if (msg.type === 'assign') {
            myCharacterFile = msg.myCharacter;
            renderGameBoards();
        } else if (msg.type === 'restart') {
            restartGame();
        } else if (msg.type === 'guess') {
            const guessedCharacter = msg.characterName;
            const guessedCorrectly = guessedCharacter === myCharacterFile;
            endGame(guessedCorrectly);
        } else if (msg.type === 'guessResult') {
            showGameResult(msg.result, msg.guesserIsHost, msg.yourCharacterFile, msg.opponentCharacterFile);
        }
    } catch (error) {
        console.error("Ошибка при обработке сообщения через DataChannel:", error);
    }
}

function restartGame() {
    gameOver = false;
    myCharacterFile = null;
    hostFile = null;
    guestFile = null;
    renderGameBoards();
    showScreen('setup-screen');
}

function checkIfReady() {
    if (localConnection.remoteDescription && dataChannel && dataChannel.readyState === 'open') {
        if (isHost) {
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
    img.style.borderRadius = '10px';
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
