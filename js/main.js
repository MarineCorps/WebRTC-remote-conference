'use strict';

let isInitiator = false;
let peerConn;
let localStream;

const localVideo = document.querySelector('#localVideo');
const remoteVideo = document.querySelector('#remoteVideo');

// Get a random room if not already present in the URL.
let room = window.location.hash.substring(1);
if (!room) {
  room = window.location.hash = randomToken();
}

/****************************************************************************
* Signaling
****************************************************************************/
const socket = io.connect();

socket.emit('create or join', room);
console.log('Attempted to create or join room', room);

socket.on('created', (room, clientId) => {
  console.log('Created room', room, '- my client ID is', clientId);
  isInitiator = true;
  grabWebCamVideo(); // Get media, wait for 'ready' to connect
});

socket.on('joined', (room, clientId) => {
  console.log('This peer has joined room', room, 'with client ID', clientId);
  isInitiator = false;
  grabWebCamVideo(); // Get media, then create connection
});

socket.on('ready', () => {
  console.log('Socket is ready');
  if (isInitiator) {
    createPeerConnection();
    // Create and send offer
    console.log('Creating an offer');
    peerConn.createOffer()
      .then(offer => peerConn.setLocalDescription(offer))
      .then(() => {
        console.log('sending local desc:', peerConn.localDescription);
        sendMessage(peerConn.localDescription);
      })
      .catch(logError);
  }
});

socket.on('full', (room) => {
  alert('Room ' + room + ' is full. We will create a new room for you.');
  window.location.hash = '';
  window.location.reload();
});

socket.on('log', (array) => console.log.apply(console, array));

socket.on('message', (message) => {
  console.log('Client received message:', message);
  signalingMessageCallback(message);
});

function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

/****************************************************************************
* Media
****************************************************************************/
function grabWebCamVideo() {
  console.log('Getting user media (video and audio) ...');
  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true
  })
  .then(gotStream)
  .catch(e => {
    alert('getUserMedia() error: ' + e.name);
    logError(e);
  });
}

function gotStream(stream) {
  console.log('getUserMedia stream:', stream);
  localStream = stream;
  localVideo.srcObject = stream;
  // For the joiner, create the peer connection now that we have media.
  // The initiator will create it when the 'ready' signal is received.
  if (!isInitiator) {
      createPeerConnection();
  }
}

/****************************************************************************
* WebRTC
****************************************************************************/
function createPeerConnection() {
  console.log('Creating Peer connection');
  try {
    peerConn = new RTCPeerConnection(null);

    peerConn.onicecandidate = event => {
      if (event.candidate) {
        sendMessage({
          type: 'candidate',
          label: event.candidate.sdpMLineIndex,
          id: event.candidate.sdpMid,
          candidate: event.candidate.candidate
        });
      } else {
        console.log('End of candidates.');
      }
    };

    peerConn.ontrack = event => {
      console.log('Remote stream added.');
      remoteVideo.srcObject = event.streams[0];
    };

    // Add tracks from local stream to peer connection
    localStream.getTracks().forEach(track => {
      peerConn.addTrack(track, localStream);
    });

    console.log('Peer connection created');
  } catch (e) {
    logError('Failed to create PeerConnection, exception: ' + e.message);
  }
}

function signalingMessageCallback(message) {
  if (message.type === 'offer') {
    console.log('Got offer. Sending answer to peer.');
    peerConn.setRemoteDescription(message)
      .then(() => peerConn.createAnswer())
      .then(answer => peerConn.setLocalDescription(answer))
      .then(() => {
        console.log('sending local desc:', peerConn.localDescription);
        sendMessage(peerConn.localDescription);
      })
      .catch(logError);
  } else if (message.type === 'answer') {
    console.log('Got answer.');
    peerConn.setRemoteDescription(message).catch(logError);
  } else if (message.type === 'candidate') {
    peerConn.addIceCandidate(message).catch(logError);
  } else if (message === 'bye') {
      // This was not in the original code, but good to handle
      console.log('Session terminated by remote peer.');
      peerConn.close();
      peerConn = null;
  }
}

/****************************************************************************
* Aux functions
****************************************************************************/
function randomToken() {
  return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
}

function logError(err) {
  if (!err) return;
  if (typeof err === 'string') {
    console.warn(err);
  } else {
    console.warn(err.toString(), err);
  }
}