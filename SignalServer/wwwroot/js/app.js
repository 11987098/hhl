/* ============================================================
 * 屏幕共享 + 双向语音通话  WebRTC 客户端（V2 重连增强版）
 * 新增功能：
 *   1. 去掉 UserJoined 去重，对方刷新重进自动重新协商
 *   2. ICE 连接断开时自动重连（最多重试 5 次）
 *   3. 对方离开时不停止本地共享，对方重进后自动恢复
 *   4. 重连状态实时提示
 * ============================================================ */

// ========== 配置 ==========
const SIGNALR_URL = '/signalhub';
const ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.qq.com:3478' },
        { urls: 'stun:stun.aliyun.com:3478' },
        { urls: 'stun:stun.miwifi.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceTransportPolicy: 'all'
};

// ========== 全局状态 ==========
let signalrConn = null;
let peerConn = null;
let micStream = null;
let screenStream = null;
let remoteStream = null;
let roomId = '';
let remoteUserId = null;
let isMicOn = false;
let isScreenSharing = false;

// ★重连相关
let reconnectTimer = null;
let reconnectCount = 0;
const MAX_RECONNECT = 5;
let isReconnecting = false;

// ========== DOM ==========
const $ = id => document.getElementById(id);
const loginScreen = $('login-screen');
const callScreen = $('call-screen');
const roomInput = $('room-input');
const joinBtn = $('join-btn');
const remoteVideo = $('remote-video');
const remotePlaceholder = $('remote-placeholder');
const connStatus = $('connection-status');
const micBtn = $('mic-btn');
const screenBtn = $('screen-btn');
const hangupBtn = $('hangup-btn');
const micStatus = $('mic-status');
const screenStatus = $('screen-status');
const roomTag = $('room-tag');

// ========== 工具：清除重连定时器 ==========
function clearReconnectTimer() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    isReconnecting = false;
    reconnectCount = 0;
}

// ========== 工具：触发重连 ==========
function triggerReconnect(reason) {
    if (isReconnecting) return;
    if (!remoteUserId) return;
    // 只有正在共享或开麦时才自动重连
    if (!isScreenSharing && !isMicOn) return;
    if (reconnectCount >= MAX_RECONNECT) {
        console.log('[重连] 已达最大重试次数，停止重连');
        setConnStatus('连接失败，请刷新页面', 'failed');
        return;
    }
    isReconnecting = true;
    reconnectCount++;
    console.log('[重连] 第' + reconnectCount + '次重连，原因:' + reason);
    setConnStatus('正在重连...(' + reconnectCount + '/' + MAX_RECONNECT + ')', '');
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
        isReconnecting = false;
        // 关闭旧连接，重新协商
        if (peerConn) {
            try { peerConn.close(); } catch (e) {}
            peerConn = null;
        }
        remoteStream = null;
        negotiate();
    }, 1000);
}

// ========== SignalR 信令初始化 ==========
async function initSignalR() {
    signalrConn = new signalR.HubConnectionBuilder()
        .withUrl(SIGNALR_URL, {
            skipNegotiation: true,
            transport: signalR.HttpTransportType.WebSockets
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000])
        .configureLogging(signalR.LogLevel.Information)
        .build();

    // --- 对方加入房间 ---
    // ★关键修复：去掉去重逻辑。对方刷新页面重进时用户ID不变，
    // 之前的去重会导致忽略重进事件，不重新协商。
    signalrConn.on('UserJoined', async (userId) => {
        console.log('[信令] 对方加入:', userId);
        // 如果是同一个用户重进，先清理旧连接
        if (remoteUserId === userId && peerConn) {
            console.log('[信令] 同一用户重进，清理旧连接准备重连');
            try { peerConn.close(); } catch (e) {}
            peerConn = null;
            remoteStream = null;
        }
        remoteUserId = userId;
        clearReconnectTimer();
        setConnStatus('对方已加入 ✓', 'connected');
        remotePlaceholder.innerHTML = '<div class="placeholder-icon">✅</div><div>对方已加入<br>正在建立连接...</div>';

        // ★如果正在共享屏幕或开麦，立即重新协商（自动恢复共享）
        if (isMicOn || isScreenSharing) {
            console.log('[信令] 本地有媒体流，自动协商恢复连接');
            await negotiate();
        } else {
            remotePlaceholder.innerHTML = '<div class="placeholder-icon">✅</div><div>对方已加入<br>点击"开麦"或"共享屏幕"开始</div>';
        }
    });

    signalrConn.on('ReceiveOffer', async (userId, sdp) => {
        remoteUserId = userId;
        console.log('[信令] 收到 Offer');
        clearReconnectTimer();
        await handleOffer(sdp);
    });

    signalrConn.on('ReceiveAnswer', async (userId, sdp) => {
        console.log('[信令] 收到 Answer');
        await handleAnswer(sdp);
    });

    signalrConn.on('ReceiveIceCandidate', async (userId, candidate, sdpMid, sdpMLineIndex) => {
        await handleIceCandidate(candidate, sdpMid, sdpMLineIndex);
    });

    // --- 对方离开 ---
    // ★修改：对方离开时不停止本地共享，只清除远端显示。
    // 这样对方重进后可以自动恢复共享画面。
    signalrConn.on('UserLeft', (userId) => {
        console.log('[信令] 对方离开:', userId);
        // 不重置 remoteUserId，保留以便对方重进时识别
        // 不停止本地共享（isScreenSharing、screenStream 保持不变）
        if (peerConn) {
            try { peerConn.close(); } catch (e) {}
            peerConn = null;
        }
        remoteStream = null;
        remoteVideo.classList.remove('show');
        remoteVideo.srcObject = null;
        // 清除动态 audio 元素
        document.querySelectorAll('audio[autoplay]').forEach(a => {
            try { a.pause(); } catch (e) {}
            try { a.remove(); } catch (e) {}
        });
        remotePlaceholder.style.display = 'block';
        if (isScreenSharing) {
            remotePlaceholder.innerHTML = '<div class="placeholder-icon">📡</div><div>对方暂时离开<br>共享继续中，对方重进后自动恢复</div>';
            setConnStatus('对方离开，等待重连...', '');
        } else {
            remotePlaceholder.innerHTML = '<div class="placeholder-icon">📡</div><div>对方已离开</div>';
            setConnStatus('对方已离开', 'failed');
        }
    });

    await signalrConn.start();
    console.log('[信令] SignalR 已连接');
}

// ========== 创建 / 重置 PeerConnection ==========
function createPeerConnection() {
    if (peerConn) {
        try { peerConn.close(); } catch (e) {}
        peerConn = null;
    }
    // ★只清除远端显示，不清除本地 micStream/screenStream
    remoteStream = null;
    remoteVideo.srcObject = null;
    document.querySelectorAll('audio[autoplay]').forEach(a => {
        try { a.pause(); } catch (e) {}
        try { a.remove(); } catch (e) {}
    });

    peerConn = new RTCPeerConnection(ICE_CONFIG);

    peerConn.onicecandidate = (event) => {
        if (event.candidate) {
            signalrConn.invoke('SendIceCandidate', roomId,
                event.candidate.candidate,
                event.candidate.sdpMid,
                event.candidate.sdpMLineIndex
            ).catch(err => console.error('发送ICE失败:', err));
        }
    };

    // 收到远端媒体轨道
    peerConn.ontrack = (event) => {
        console.log('[WebRTC] 收到远端轨道:', event.track.kind);

        if (event.track.kind === 'audio') {
            // 每个音频轨道独立 audio 元素
            const audioEl = document.createElement('audio');
            audioEl.autoplay = true;
            audioEl.style.display = 'none';
            document.body.appendChild(audioEl);
            const trackStream = new MediaStream([event.track]);
            audioEl.srcObject = trackStream;
            audioEl.play().catch(e => console.log('[音频] 播放失败:', e));
            event.track.addEventListener('ended', () => {
                try { audioEl.pause(); } catch (e) {}
                try { audioEl.remove(); } catch (e) {}
            });
        } else if (event.track.kind === 'video') {
            if (!remoteStream) {
                remoteStream = new MediaStream();
                remoteVideo.srcObject = remoteStream;
            }
            remoteStream.addTrack(event.track);
            remoteVideo.classList.add('show');
            remotePlaceholder.style.display = 'none';
        }
    };

    // ICE 连接状态
    peerConn.oniceconnectionstatechange = () => {
        const state = peerConn.iceConnectionState;
        console.log('[WebRTC] ICE 状态:', state);
        switch (state) {
            case 'checking':
                setConnStatus('连接中...', '');
                break;
            case 'connected':
            case 'completed':
                clearReconnectTimer();
                setConnStatus('已连接', 'connected');
                break;
            case 'failed':
                setConnStatus('连接失败', 'failed');
                // ★自动重连
                triggerReconnect('ICE failed');
                break;
            case 'disconnected':
                setConnStatus('连接断开，正在重连...', '');
                // ★自动重连
                triggerReconnect('ICE disconnected');
                break;
            case 'closed':
                setConnStatus('已关闭', 'failed');
                break;
        }
    };

    // 远端轨道移除
    peerConn.onremovetrack = (event) => {
        if (remoteStream) {
            try { remoteStream.removeTrack(event.track); } catch (e) {}
        }
        if (event.track.kind === 'video') {
            remoteVideo.classList.remove('show');
            remotePlaceholder.style.display = 'block';
            remotePlaceholder.innerHTML = '<div class="placeholder-icon">📡</div><div>对方停止共享屏幕</div>';
        }
    };
}

// ========== 同步本地轨道 ==========
function syncLocalTracks() {
    if (!peerConn) return;
    const senders = peerConn.getSenders();
    const wantedTracks = [];
    if (micStream) wantedTracks.push(...micStream.getTracks());
    if (screenStream) wantedTracks.push(...screenStream.getTracks());

    senders.forEach(sender => {
        if (sender.track && sender.track.readyState === 'ended') {
            try { peerConn.removeTrack(sender); } catch (e) {}
        }
    });

    wantedTracks.forEach(track => {
        const exists = senders.some(s => s.track === track);
        if (!exists) {
            let stream = null;
            if (micStream && micStream.getTracks().includes(track)) {
                stream = micStream;
            } else if (screenStream && screenStream.getTracks().includes(track)) {
                stream = screenStream;
            }
            peerConn.addTrack(track, stream);
        }
    });
}

// ========== 发起协商 ==========
async function negotiate() {
    if (!peerConn) createPeerConnection();
    if (!remoteUserId) {
        console.log('[协商] 对方尚未加入，暂不发送 offer');
        return;
    }
    syncLocalTracks();
    try {
        const offer = await peerConn.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConn.setLocalDescription(offer);
        console.log('[协商] 发送 Offer');
        await signalrConn.invoke('SendOffer', roomId, offer.sdp);
    } catch (err) {
        console.error('[协商] 创建 Offer 失败:', err);
    }
}

// ========== 处理收到的 Offer ==========
async function handleOffer(sdp) {
    if (!peerConn) createPeerConnection();
    try {
        await peerConn.setRemoteDescription(new RTCSessionDescription({
            type: 'offer', sdp
        }));
        syncLocalTracks();
        const answer = await peerConn.createAnswer();
        await peerConn.setLocalDescription(answer);
        console.log('[协商] 发送 Answer');
        await signalrConn.invoke('SendAnswer', roomId, answer.sdp);
    } catch (err) {
        console.error('[协商] 处理 Offer 失败:', err);
    }
}

// ========== 处理收到的 Answer ==========
async function handleAnswer(sdp) {
    if (!peerConn) return;
    try {
        await peerConn.setRemoteDescription(new RTCSessionDescription({
            type: 'answer', sdp
        }));
    } catch (err) {
        console.error('[协商] 处理 Answer 失败:', err);
    }
}

// ========== 处理 ICE 候选 ==========
async function handleIceCandidate(candidate, sdpMid, sdpMLineIndex) {
    if (!peerConn || !candidate) return;
    try {
        await peerConn.addIceCandidate(new RTCIceCandidate({
            candidate, sdpMid, sdpMLineIndex
        }));
    } catch (err) {
        console.error('[ICE] 添加候选失败:', err);
    }
}

// ========== 麦克风开关 ==========
async function toggleMic() {
    if (isMicOn) {
        if (micStream) {
            micStream.getAudioTracks().forEach(t => t.enabled = false);
        }
        isMicOn = false;
        micBtn.textContent = '🎤 开麦';
        micBtn.classList.remove('active');
        micStatus.textContent = '🎤 麦克风关';
        micStatus.classList.remove('on');
    } else {
        if (micStream) {
            micStream.getAudioTracks().forEach(t => t.enabled = true);
            isMicOn = true;
            micBtn.textContent = '🎤 闭麦';
            micBtn.classList.add('active');
            micStatus.textContent = '🎤 麦克风开';
            micStatus.classList.add('on');
        } else {
            try {
                micStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
                isMicOn = true;
                micBtn.textContent = '🎤 闭麦';
                micBtn.classList.add('active');
                micStatus.textContent = '🎤 麦克风开';
                micStatus.classList.add('on');
            } catch (err) {
                alert('无法访问麦克风：' + err.message + '\n请检查浏览器权限设置。');
                return;
            }
        }
    }
    if (peerConn && remoteUserId && micStream) {
        const hasAudioSender = peerConn.getSenders().some(s =>
            s.track && s.track.kind === 'audio' && micStream.getTracks().includes(s.track)
        );
        if (!hasAudioSender) {
            await negotiate();
        }
    }
}

// ========== 屏幕共享开关 ==========
async function toggleScreenShare() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert('当前浏览器不支持屏幕共享！\n\n请使用：\n• Android：Chrome 浏览器\n• iPhone：Safari 15+\n\n注意：微信/QQ内置浏览器、UC/百度等浏览器不支持屏幕共享。');
        return;
    }
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile && !isScreenSharing) {
        console.log('[提示] 移动端屏幕共享仅支持Chrome/Safari，且只能共享整个屏幕');
    }

    if (isScreenSharing) {
        // ★停止共享：停止轨道并重新协商（通知对方移除视频轨）
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
        }
        isScreenSharing = false;
        screenBtn.textContent = '📺 共享屏幕';
        screenBtn.classList.remove('active');
        screenStatus.textContent = '📺 未共享';
        screenStatus.classList.remove('on');
        // 重新协商，通知对方移除视频轨
        if (peerConn && remoteUserId) {
            await negotiate();
        }
    } else {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: { ideal: 30, max: 30 },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: true
            });
            isScreenSharing = true;
            screenBtn.textContent = '📺 停止共享';
            screenBtn.classList.add('active');
            screenStatus.textContent = '📺 共享中';
            screenStatus.classList.add('on');
            screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                if (isScreenSharing) toggleScreenShare();
            });
        } catch (err) {
            let msg = '屏幕共享失败：' + err.name;
            if (err.message) msg += '\n' + err.message;
            if (err.name === 'NotAllowedError') {
                msg += '\n\n（你取消了授权，或浏览器拒绝了屏幕共享请求）';
            }
            if (err.name === 'NotFoundError') {
                msg += '\n\n（当前浏览器/设备不支持屏幕共享）';
            }
            alert(msg);
            return;
        }
    }
    if (peerConn && remoteUserId) {
        await negotiate();
    }
}

// ========== 挂断 ==========
function hangup() {
    clearReconnectTimer();
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    if (peerConn) { peerConn.close(); peerConn = null; }
    remoteStream = null;
    isMicOn = false;
    isScreenSharing = false;
    remoteUserId = null;

    remoteVideo.classList.remove('show');
    remoteVideo.srcObject = null;
    document.querySelectorAll('audio[autoplay]').forEach(a => {
        try { a.pause(); } catch (e) {}
        try { a.remove(); } catch (e) {}
    });
    remotePlaceholder.style.display = 'block';
    remotePlaceholder.innerHTML = '<div class="placeholder-icon">📡</div><div>等待对方共享屏幕...</div>';
    micBtn.textContent = '🎤 开麦';
    micBtn.classList.remove('active');
    screenBtn.textContent = '📺 共享屏幕';
    screenBtn.classList.remove('active');
    micStatus.textContent = '🎤 麦克风关';
    micStatus.classList.remove('on');
    screenStatus.textContent = '📺 未共享';
    screenStatus.classList.remove('on');
    setConnStatus('未连接', '');

    callScreen.classList.remove('active');
    loginScreen.classList.add('active');
}

// ========== 工具函数 ==========
function setConnStatus(text, cls) {
    connStatus.textContent = text;
    connStatus.className = 'conn-status ' + cls;
}

// ========== 事件绑定 ==========
joinBtn.addEventListener('click', async () => {
    roomId = roomInput.value.trim();
    if (!roomId) { alert('请输入房间号'); return; }
    try {
        if (!signalrConn) await initSignalR();
        await signalrConn.invoke('JoinRoom', roomId);
        roomTag.textContent = '房间: ' + roomId;
        loginScreen.classList.remove('active');
        callScreen.classList.add('active');
        setConnStatus('等待对方加入...', '');
        remotePlaceholder.innerHTML = '<div class="placeholder-icon">📡</div><div>等待对方加入房间...</div>';
        createPeerConnection();
    } catch (err) {
        alert('加入房间失败：' + err.message);
    }
});

micBtn.addEventListener('click', toggleMic);
screenBtn.addEventListener('click', toggleScreenShare);
hangupBtn.addEventListener('click', hangup);

remoteVideo.addEventListener('click', () => {
    if (!remoteVideo.classList.contains('show')) return;
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else if (document.webkitFullscreenElement) {
        document.webkitExitFullscreen();
    } else {
        if (remoteVideo.requestFullscreen) {
            remoteVideo.requestFullscreen();
        } else if (remoteVideo.webkitRequestFullscreen) {
            remoteVideo.webkitRequestFullscreen();
        } else if (remoteVideo.webkitEnterFullscreen) {
            remoteVideo.webkitEnterFullscreen();
        } else {
            alert('当前浏览器不支持全屏');
        }
    }
});

roomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinBtn.click();
});
