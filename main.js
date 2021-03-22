import './style.css'
import firebase from 'firebase/app'
import 'firebase/firestore'
import firebaseConfig from './config' 

if (!firebase.apps.length){
  firebase.initializeApp(firebaseConfig)
}

const firestore = firebase.firestore()

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

//Global state
let pc = new RTCPeerConnection(servers)
let localStream = null;
let remoteStream = null;


const webcamButton = document.getElementById('webcamButton')
const webcamVideo = document.getElementById('webcamVideo')
const callButton = document.getElementById('callButton')
const callInput = document.getElementById('callInput')
const answerButton = document.getElementById('answerButton')
const remoteVideo = document.getElementById('remoteVideo')
const hangupButton = document.getElementById('hangupButton')




//Setup media sources
const constraints = {video: true, audio: true}


webcamButton.onclick = async () => {
    localStream = await navigator.mediaDevices.getUserMedia(constraints).then(stream => {
      console.log('Got MediaStream:', stream);
  })
  .catch(error => {
      console.error('Error accessing media devices.', error);
  });

  
    remoteStream = new MediaStream();

    //push tracks from local stream to peer
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream)
    });


    //pull tracks from remote stream, add to video stream
    pc.ontrack = event => {
      event.streams[0].getTracks().forEach(track => {
        remoteStream.addTrack(track)
      })

    }
  
  
    webcamVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;
  
    callButton.disabled = false;
    answerButton.disabled = false;
    webcamButton.disabled = true;

  }






  //Call an offer
  callButton.onclick = async () => {
    //Reference Firestore collection
    const callDoc = firestore.collection("calls").doc()
    const offerCandidates = callDoc.collection('offerCandidates')
    const answerCandidates = callDoc.collection('answerCandidates')

    callInput.value = callDoc.id;
    

    //Get candidates for xaller, save to db
    pc.onicecandidate = event => {
      event.candidate && offerCandidates.add(event.candidate.toJSON())
    }


    //Create offer and save in db
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription)

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    }


    await callDoc.set({ offer });

    // Listen for remote answer
    callDoc.onSnapshot((snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });
  
    // When answered, add candidate to peer connection
    answerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    hangupButton.disabled = false;

  }


  

  answerButton.onclick = async () => {
    const callId = callInput.value; 
    const callDoc = firestore.collection('calls').doc(callId);
    const answerCandidates = callDoc.collection('answerCandidates')
    const offerCandidates = callDoc.collection('offerCandidates');

    pc.onicecandidate = event => {
      event.candidate && answerCandidates.add(event.candidate.toJSON());
    } 

    const callData = (await callDoc.get()).data(); 

    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription))

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type, 
      sdp: answerDescription.sdp 
    }

    await callDoc.update({ answer })


    

    offerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        console.log(change);
        if (change.type === 'added') {
          let data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });


  }