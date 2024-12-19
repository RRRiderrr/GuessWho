// Конфигурация для RTCPeerConnection c STUN-сервером
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
let offerDesc = null;
let answerDesc = null;

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
            answerDesc = JSON.parse(ans);
            await localConnection.setRemoteDescription(answerDesc);
            checkIfReady();
        });

        document.getElementById('ask-btn').addEventListener('click', () => {
            const question = document.getElementById('question').value.trim();
            if (question && dataChannel && dataChannel.readyState === 'open') {
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

    const offer = await localConnection.createOffer();
    await localConnection.setLocalDescription(offer);

    document.getElementById('host-setup').style.display = 'none';
    document.getElementById('signal-exchange').style.display = 'block';
    document.getElementById('local-desc').value = JSON.stringify(localConnection.localDescription);

    // Показываем блок для вставки answer
    document.getElementById('host-accept-answer').style.display = 'block';

    localConnection.onicecandidate = (e) => {
        // ждем финала сборки кандидатов
    };
}

async function startGuest(remoteOffer) {
    remoteConnection = new RTCPeerConnection(rtcConfig);

    remoteConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        dataChannel.onopen = onDataChannelOpen;
        dataChannel.onmessage = onDataChannelMessage;
    };

    offerDesc = JSON.parse(remoteOffer);
    await remoteConnection.setRemoteDescription(offerDesc);
    const answer = await remoteConnection.createAnswer();
    await remoteConnection.setLocalDescription(answer);

    document.getElementById('join-setup').style.display = 'none';
    document.getElementById('signal-exchange').style.display = 'block';
    document.getElementById('local-desc').value = JSON.stringify(remoteConnection.localDescription);

    remoteConnection.onicecandidate = (e) => {
        // ждем финала сборки кандидатов
    };
}

function onDataChannelOpen() {
    console.log('Data channel открыт!');
    checkIfReady();
}

function checkIfReady() {
    // Для хоста: проверить что у него установлен answer и канал открыт
    if (isHost && localConnection && localConnection.remoteDescription && dataChannel && dataChannel.readyState === 'open') {
        // Отправляем информацию о наборе
        dataChannel.send(JSON.stringify({type:'set', set:chosenSet, chars: characters}));
        transitionToGame();
    } else if (!isHost && dataChannel && dataChannel.readyState === 'open') {
        // Гость ждёт набор от хоста. Когда получит, перейдет к игре.
    }
}

function onDataChannelMessage(event) {
    const msg = JSON.parse(event.data);
    if (msg.type === 'set') {
        chosenSet = msg.set;
        characters = msg.chars;
        transitionToGame();
        renderCharacters();
    } else if (msg.type === 'question') {
        document.getElementById('status').textContent = "Противник спрашивает: " + msg.text;
        // Можно добавить логику ответа
    }
}

function renderCharacters() {
    const board = document.getElementById('characters');
    board.innerHTML = '';
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
        board.appendChild(div);
    });
}

function transitionToGame() {
    document.getElementById('signal-exchange').style.display = 'none';
    document.getElementById('host-accept-answer').style.display = 'none';
    document.getElementById('game-board').style.display = 'block';
}
