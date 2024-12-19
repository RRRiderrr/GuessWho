// Конфигурация для RTCPeerConnection (используем публичный STUN)
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
let myCharacter = null;        // Секретный персонаж текущего игрока
let opponentCharacter = null;  // Секретный персонаж оппонента (узнаем из guessResult)
let gameOver = false;

let offerDesc = null;
let answerDesc = null;

// Секреты хост хранит для обеих сторон
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
        console.error("Получен некорректный SDP, ожидается offer");
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
        // Гость получает набор
        chosenSet = msg.set;
        characters = msg.chars;
    } else if (msg.type === 'assign') {
        // Гость получает своего скрытого персонажа
        myCharacter = msg.myCharacter;
        // У гостя есть только myCharacter
        renderGameBoards();
    } else if (msg.type === 'question') {
        document.getElementById('status').textContent = "Противник спрашивает: " + msg.text;
    } else if (msg.type === 'guess') {
        // Проверить угадан ли персонаж
        if (msg.characterName === myCharacter) {
            endGame(true, msg.characterName);
        } else {
            endGame(false, msg.characterName);
        }
    } else if (msg.type === 'guessResult') {
        // Показать результаты
        gameOver = true;
        showGameResult(msg.result, msg.yourCharacter, msg.myCharacter);
    }
}

function checkIfReady() {
    if (isHost) {
        if (localConnection.remoteDescription && dataChannel && dataChannel.readyState === 'open') {
            assignCharacters();
        }
    } else {
        // Гость готов, когда получит assign
    }
}

function assignCharacters() {
    // Хост выбирает случайно персонажа для себя и для гостя
    const hostIndex = Math.floor(Math.random() * characters.length);
    const guestIndex = Math.floor(Math.random() * characters.length);
    
    hostSecret = characters[hostIndex].replace(/\..+$/, '');
    guestSecret = characters[guestIndex].replace(/\..+$/, '');
    
    myCharacter = hostSecret; // хосту свой персонаж

    // Отправить гостю
    dataChannel.send(JSON.stringify({type:'set', set:chosenSet, chars: characters}));
    dataChannel.send(JSON.stringify({type:'assign', myCharacter: guestSecret}));

    renderGameBoards();
}

function renderGameBoards() {
    document.getElementById('signal-exchange').style.display = 'none';
    document.getElementById('host-accept-answer').style.display = 'none';
    document.getElementById('game-board').style.display = 'block';

    // Мой персонаж (только один)
    const myContainer = document.getElementById('my-character-container');
    myContainer.innerHTML = '';
    const myCharDiv = document.createElement('div');
    myCharDiv.className = 'char';
    const myCharImg = document.createElement('img');
    const myCharFile = characters.find(c => c.replace(/\..+$/, '') === myCharacter);
    myCharImg.src = `packs/${chosenSet}/${myCharFile}`;
    const myCharP = document.createElement('p');
    myCharP.textContent = myCharacter;
    myCharDiv.appendChild(myCharImg);
    myCharDiv.appendChild(myCharP);
    myContainer.appendChild(myCharDiv);

    // Персонажи оппонента (все)
    const oppBoard = document.getElementById('opponent-characters');
    oppBoard.innerHTML = '';
    characters.forEach(c => {
        const name = c.replace(/\..+$/, '');
        const div = document.createElement('div');
        div.className = 'char';
        const img = document.createElement('img');
        img.src = `packs/${chosenSet}/${c}`;
        const p = document.createElement('p');
        p.textContent = name;
        div.appendChild(img);
        div.appendChild(p);

        // Кнопка "Выбрать персонажа"
        const guessBtn = document.createElement('button');
        guessBtn.textContent = "Выбрать персонажа";
        guessBtn.className = 'guess-btn';
        guessBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (gameOver) return;
            makeGuess(name);
        });
        div.appendChild(guessBtn);

        // Клик по карточке оппонента - скрыть/показать
        div.addEventListener('click', () => {
            if (gameOver) return;
            div.classList.toggle('hidden');
        });

        oppBoard.appendChild(div);
    });
}

function makeGuess(characterName) {
    if (!gameOver && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({type:'guess', characterName: characterName}));
    }
}

function endGame(guessedCorrectly, guessedCharacter) {
    gameOver = true;
    const result = guessedCorrectly ? 'correct' : 'wrong';

    // У хоста есть оба персонажа
    // У гостя только свой. Чтобы все знали оба персонажа:
    // При guessResult передадим yourCharacter (мой) и myCharacter (угадываемый)
    // Для хоста: yourCharacter = myCharacter (у кого сейчас endGame вызывается), myCharacter = тот, кого назвали.
    // У хоста: yourCharacter = hostSecret, myCharacter = guestSecret, если гость угадывал.
    // Но мы должны отразить итог одинаково.
    // Логика: 
    // - Если хост отвечает на guess (значит гость угадывал):
    //   yourCharacter = hostSecret (хостовский персонаж)
    //   myCharacter = guestSecret (гостевской персонаж)
    // - Если гость отвечает на guess (значит хост угадывал):
    //   yourCharacter = guestSecret (гостевской)
    //   myCharacter = hostSecret (хостовской)
    // Узнаем по роли:
    let yourChar, oppChar;
    if (isHost) {
        yourChar = hostSecret;
        oppChar = guestSecret;
    } else {
        yourChar = guestSecret;
        oppChar = hostSecret;
    }

    const guessResultMsg = {
        type: 'guessResult',
        result: result,
        yourCharacter: yourChar,
        myCharacter: oppChar
    };

    // Отправляем оппоненту
    dataChannel.send(JSON.stringify(guessResultMsg));
    // Отображаем результат у себя
    showGameResult(result, yourChar, oppChar);
}

function showGameResult(result, yourChar, oppChar) {
    gameOver = true;
    document.getElementById('game-board').style.display = 'none';
    document.getElementById('game-result').style.display = 'block';

    const msg = result === 'correct' ? 'Вы угадали персонажа оппонента!' : 'Вы не угадали! Оппонент выиграл.';
    document.getElementById('result-message').textContent = msg;
    document.getElementById('your-character').textContent = yourChar;
    document.getElementById('opponent-character').textContent = oppChar;
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
