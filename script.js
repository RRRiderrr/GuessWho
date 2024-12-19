const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

let localConnection;
let remoteConnection;
let dataChannel;

document.addEventListener('DOMContentLoaded', () => {
    // Хост создает соединение
    document.getElementById('host-btn').addEventListener('click', async () => {
        localConnection = new RTCPeerConnection(rtcConfig);

        // Создаем Data Channel
        dataChannel = localConnection.createDataChannel("testChannel");
        dataChannel.onopen = () => {
            console.log("Data Channel открыт!");
            document.getElementById('status').textContent = "Data Channel открыт!";
        };

        dataChannel.onmessage = (event) => {
            console.log("Сообщение от гостя:", event.data);
            document.getElementById('status').textContent = "Сообщение от гостя: " + event.data;
        };

        const offer = await localConnection.createOffer();
        await localConnection.setLocalDescription(offer);

        document.getElementById('host-offer').textContent = JSON.stringify(offer);
    });

    // Гость принимает соединение
    document.getElementById('guest-btn').addEventListener('click', async () => {
        const offerText = document.getElementById('guest-offer').value;
        if (!offerText) {
            console.error("Введите offer от хоста!");
            return;
        }

        const offer = JSON.parse(offerText);
        remoteConnection = new RTCPeerConnection(rtcConfig);

        remoteConnection.ondatachannel = (event) => {
            dataChannel = event.channel;

            dataChannel.onopen = () => {
                console.log("Data Channel открыт на стороне гостя!");
                document.getElementById('status').textContent = "Data Channel открыт!";
            };

            dataChannel.onmessage = (event) => {
                console.log("Сообщение от хоста:", event.data);
                document.getElementById('status').textContent = "Сообщение от хоста: " + event.data;
            };
        };

        await remoteConnection.setRemoteDescription(offer);

        const answer = await remoteConnection.createAnswer();
        await remoteConnection.setLocalDescription(answer);

        document.getElementById('guest-answer').textContent = JSON.stringify(answer);
    });

    // Хост принимает answer
    document.getElementById('host-accept-btn').addEventListener('click', async () => {
        const answerText = document.getElementById('host-answer').value;
        if (!answerText) {
            console.error("Введите answer от гостя!");
            return;
        }

        const answer = JSON.parse(answerText);
        await localConnection.setRemoteDescription(answer);
        console.log("Соединение установлено!");
        document.getElementById('status').textContent = "Соединение установлено!";
    });

    // Отправить сообщение
    document.getElementById('send-msg-btn').addEventListener('click', () => {
        const message = document.getElementById('message-input').value;
        if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(message);
            console.log("Сообщение отправлено:", message);
            document.getElementById('status').textContent = "Сообщение отправлено!";
        } else {
            console.error("Data Channel закрыт или не готов.");
        }
    });
});
