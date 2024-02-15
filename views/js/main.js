/*
The MIT License (MIT)

Copyright (c) 2014 Chris Wilson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

window.audioContext = window.audioContext || window.webkitaudioContext;

var audioContext = null;
var genAudioContext = null;
var isPlaying = false;
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var DEBUGCANVAS = null;
var mediaStreamSource = null;
var detectorElem, 
	canvasElem,
	waveCanvas,
	pitchElem,
	noteElem,
	detuneElem,
	detuneAmount,
	source,
	sampleRate,
	duration,
	numChannels,
	buffer,
	channelData;
var mouseDown = 0;
var playing = 0;
var rotate = 0;
var settings_arr = [];
var input_arr = [];
settings_defaults = `#c8c8c8,200,1,10,#00ffbf,10,10`

window.onload = function() {
	audioContext = new AudioContext();
	MAX_SIZE = Math.max(4,Math.floor(audioContext.sampleRate/5000));	// corresponds to a 5kHz signal
	var request = new XMLHttpRequest();
	request.open("GET", "../sounds/whistling3.ogg", true);
	request.responseType = "arraybuffer";
	request.onload = function() {
	  audioContext.decodeAudioData( request.response, function(buffer) { 
	    	theBuffer = buffer;
		} );
	}
	request.send();

	detectorElem = document.getElementById( "detector" );
	canvasElem = document.getElementById( "output" );
	DEBUGCANVAS = document.getElementById( "waveform" );
	detectorElem.style.display = "none"
	canvasElem.style.display = "none"
	if (DEBUGCANVAS) {
		waveCanvas = DEBUGCANVAS.getContext("2d");
		waveCanvas.strokeStyle = "black";
		waveCanvas.lineWidth = 1;
	}
	pitchElem = document.getElementById( "pitch" );
	noteElem = document.getElementById( "note" );
	detuneElem = document.getElementById( "detune" );
	detuneAmount = document.getElementById( "detune_amt" );

	detectorElem.ondragenter = function () { 
		this.classList.add("droptarget"); 
		return false; };
	detectorElem.ondragleave = function () { this.classList.remove("droptarget"); return false; };
	detectorElem.ondrop = function (e) {
  		this.classList.remove("droptarget");
  		e.preventDefault();
		theBuffer = null;

	  	var reader = new FileReader();
	  	reader.onload = function (event) {
	  		audioContext.decodeAudioData( event.target.result, function(buffer) {
	    		theBuffer = buffer;
	  		}, function(){alert("error loading!");} ); 

	  	};
	  	reader.onerror = function (event) {
	  		alert("Error: " + reader.error );
		};
	  	reader.readAsArrayBuffer(e.dataTransfer.files[0]);
	  	return false;
	};

	genAudioContext = new AudioContext();
	setInterval(check, 100)
}

function error() {
    alert('Stream generation failed.');
}

function getUserMedia(dictionary, callback) {
    try {
        navigator.getUserMedia = 
        	navigator.getUserMedia ||
			navigator.mediaDevices.getUserMedia ||
        	navigator.webkitGetUserMedia ||
        	navigator.mozGetUserMedia;
        navigator.getUserMedia(dictionary, callback, error);
    } catch (e) {
        alert('getUserMedia threw exception :' + e);
    }
}

function gotStream(stream) {
    // Create an AudioNode from the stream.
    mediaStreamSource = audioContext.createMediaStreamSource(stream);

    // Connect it to the destination.
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    mediaStreamSource.connect( analyser );
    updatePitch();
}

function toggleOscillator() {
    if (isPlaying) {
        //stop playing and return
        sourceNode.stop( 0 );
        sourceNode = null;
        analyser = null;
        isPlaying = false;
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame( rafID );
        return "play oscillator";
    }
    sourceNode = audioContext.createOscillator();

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode.connect( analyser );
    analyser.connect( audioContext.destination );
    sourceNode.start(0);
    isPlaying = true;
    isLiveInput = false;
    updatePitch();

    return "stop";
}

function toggleLiveInput() {
    if (isPlaying) {
        //stop playing and return
        sourceNode.stop( 0 );
        sourceNode = null;
        analyser = null;
        isPlaying = false;
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame( rafID );
    }
    getUserMedia(
    	{
            "audio": {
                "mandatory": {
                    "googEchoCancellation": "false",
                    "googAutoGainControl": "false",
                    "googNoiseSuppression": "false",
                    "googHighpassFilter": "false"
                },
                "optional": []
            },
        }, gotStream);
}

function togglePlayback() {
    if (isPlaying) {
        //stop playing and return
        sourceNode.stop( 0 );
        sourceNode = null;
        analyser = null;
        isPlaying = false;
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame( rafID );
        return "Start";
    }

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = theBuffer;
    sourceNode.loop = true;

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode.connect( analyser );
    analyser.connect( audioContext.destination );
    sourceNode.start( 0 );
    isPlaying = true;
    isLiveInput = false;
    updatePitch();
    //document.getElementById("button").style.display = "none"
	detectorElem.style.display = "block"
	canvasElem.style.display = "block"
    return "Stop";
}

var rafID = null;
var tracks = null;
var buflen = 1024;
var buf = new Float32Array( buflen );

var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteFromPitch( frequency ) {
	var noteNum = 12 * (Math.log( frequency / 440 )/Math.log(2) );
	return Math.round( noteNum ) + 69;
}

function frequencyFromNoteNumber( note ) {
	return 440 * Math.pow(2,(note-69)/12);
}

function centsOffFromPitch( frequency, note ) {
	return Math.floor( 1200 * Math.log( frequency / frequencyFromNoteNumber( note ))/Math.log(2) );
}

var MIN_SAMPLES = 0;  // will be initialized when audioContext is created.

function autoCorrelate( buf, sampleRate ) {
	var SIZE = buf.length;
	var MAX_SAMPLES = Math.floor(SIZE/2);
	var best_offset = -1;
	var best_correlation = 0;
	var rms = 0;
	var foundGoodCorrelation = false;
	var correlations = new Array(MAX_SAMPLES);

	for (var i=0;i<SIZE;i++) {
		var val = buf[i];
		rms += val*val;
	}
	rms = Math.sqrt(rms/SIZE);
	if (rms<0.01) // not enough signal
		return -1;

	var lastCorrelation=1;
	for (var offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
		var correlation = 0;

		for (var i=0; i<MAX_SAMPLES; i++) {
			correlation += Math.abs((buf[i])-(buf[i+offset]));
		}
		correlation = 1 - (correlation/MAX_SAMPLES);
		correlations[offset] = correlation; // store it, for the tweaking we need to do below.
		if ((correlation>0.9) && (correlation > lastCorrelation)) {
			foundGoodCorrelation = true;
			if (correlation > best_correlation) {
				best_correlation = correlation;
				best_offset = offset;
			}
		} else if (foundGoodCorrelation) {
			// short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
			// Now we need to tweak the offset - by interpolating between the values to the left and right of the
			// best offset, and shifting it a bit.  This is complex, and HACKY in this code (happy to take PRs!) -
			// we need to do a curve fit on correlations[] around best_offset in order to better determine precise
			// (anti-aliased) offset.

			// we know best_offset >=1, 
			// since foundGoodCorrelation cannot go to true until the second pass (offset=1), and 
			// we can't drop into this clause until the following pass (else if).
			var shift = (correlations[best_offset+1] - correlations[best_offset-1])/correlations[best_offset];  
			return sampleRate/(best_offset+(8*shift));
		}
		lastCorrelation = correlation;
	}
	if (best_correlation > 0.01) {
		// console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")")
		return sampleRate/best_offset;
	}
	return -1;
//	var best_frequency = sampleRate/best_offset;
}

function updatePitch( time ) {
	var cycles = new Array;
	analyser.getFloatTimeDomainData( buf );
	var ac = autoCorrelate( buf, audioContext.sampleRate );
	// TODO: Paint confidence meter on canvasElem here.

	if (DEBUGCANVAS) {  // This draws the current waveform, useful for debugging
		waveCanvas.clearRect(0,0,512,256);
		waveCanvas.strokeStyle = "red";
		waveCanvas.beginPath();
		waveCanvas.moveTo(0,0);
		waveCanvas.lineTo(0,256);
		waveCanvas.moveTo(128,0);
		waveCanvas.lineTo(128,256);
		waveCanvas.moveTo(256,0);
		waveCanvas.lineTo(256,256);
		waveCanvas.moveTo(384,0);
		waveCanvas.lineTo(384,256);
		waveCanvas.moveTo(512,0);
		waveCanvas.lineTo(512,256);
		waveCanvas.stroke();
		waveCanvas.strokeStyle = "black";
		waveCanvas.beginPath();
		waveCanvas.moveTo(0,buf[0]);
		for (var i=1;i<512;i++) {
			waveCanvas.lineTo(i,128+(buf[i]*128));
		}
		waveCanvas.stroke();
	}

 	if (ac == -1) {
 		detectorElem.className = "vague";
	 	pitchElem.innerText = "--";
		noteElem.innerText = "-";
		detuneElem.className = "";
		detuneAmount.innerText = "--";
		noteElem.style.color = 'rgb(200, 200, 200)'
 	} else {
	 	detectorElem.className = "confident";
	 	pitch = ac;
	 	pitchElem.innerText = Math.round( pitch ) ;
	 	var note =  noteFromPitch( pitch );
		noteElem.innerHTML = noteStrings[note%12];
		var detune = centsOffFromPitch( pitch, note );
		if (detune == 0 ) {
			detuneElem.className = "";
			detuneAmount.innerHTML = "--";
		} else {
			if (detune < 0)
				detuneElem.className = "flat";
			else
				detuneElem.className = "sharp";
			detuneAmount.innerHTML = Math.abs( detune );
			if (Math.abs( detune ) > 35) { noteElem.style.color = 'rgb(255, 0, 0)' }
			else if (Math.abs( detune ) > 20) { noteElem.style.color = 'rgb(255, 127, 0)' }
			else if (Math.abs( detune ) > 10) { noteElem.style.color = 'rgb(255, 255, 0)' }
			else { noteElem.style.color = 'rgb(0, 255, 0)' }
		}
	}

	if (!window.requestAnimationFrame)
		window.requestAnimationFrame = window.webkitRequestAnimationFrame;
	rafID = window.requestAnimationFrame( updatePitch );
}

/* 

GENERATOR

*/

function playFrequency(frequency) {
    // create 2 second worth of audio buffer, with single channels and sampling rate of your device.
    sampleRate = genAudioContext.sampleRate;
    duration = sampleRate * 60;
    numChannels = 1;
    buffer  = genAudioContext.createBuffer(numChannels, duration, sampleRate);
    // fill the channel with the desired frequency's data
    channelData = buffer.getChannelData(0);
    for (var i = 0; i < sampleRate* 60; i++) {
      channelData[i]=Math.sin(2*Math.PI*frequency*i/(sampleRate));
    }

    // create audio source node.
    source = genAudioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(genAudioContext.destination);

    // finally start to play
    source.start(0);
    playing = 1;
}

function check() {
	document.getElementById("game_player").style.filter = "hue-rotate(" + rotate + "deg)"
    document.getElementById("button").onmousedown = function() { 
      mouseDown = !mouseDown;
    }
    if (mouseDown == 1) { 
      playing == 1 
      document.getElementById("button").innerHTML = "Stop"
    }
    if (mouseDown == 0) { 
      source.stop()
      playing = 0
      document.getElementById("button").innerHTML = "Play"
    }
    if (mouseDown == 1 && playing == 0) {
      playFrequency(document.getElementById("frequency").value)
    }
}

function print(input, index) {
    if (input != "") {
        let item_row = document.createElement("div")
        item_row.className = "itemDiv"

        let new_item = document.createElement("span")
        new_item.innerHTML = "   " + input

        let close_button = document.createElement("button")
        close_button.className = "close-button"
        close_button.innerHTML = "X"
        close_button.onclick = function() {delete_cookie_input(index)};

        item_row.appendChild(close_button)
        item_row.appendChild(new_item)

        list.appendChild(item_row)
    }
}

function add_to_list() {
    let input = document.getElementById("prompt-input").value
    let index = input_arr.length
    print(input, index)
    input_arr.push(input)
    document.cookie = `input=` + input_arr.join() + `;max-age=1000`
}

function enter(ele) {
    if(ele.keyCode === 13) {
        add_to_list();
    }
}

function update_settings() {
    let setting1 = document.getElementById("inp").value
    let setting2 = document.getElementById("range1").value
    let setting3 = document.getElementById("range2").value
    let setting4 = document.getElementById("range3").value
    let setting5 = document.getElementById("range4").value
    let setting6 = document.getElementById("range5").value
    let setting7 = document.getElementById("range6").value

	document.documentElement.style.setProperty('--border', setting1);
	rotate = setting2;
	if (setting3 > 0) { $('.rain').css('display', 'block') }
	else { $('.rain').css('display', 'none') }
	document.documentElement.style.setProperty('--glow', setting4 + "px");
	document.documentElement.style.setProperty('--text', setting5);
	document.documentElement.style.setProperty('--textglow', setting6 + "px");
	document.documentElement.style.setProperty('--radius', setting7 + "px");

	settings_arr = [setting1, setting2, setting3, setting4, setting5, setting6, setting7]

    document.cookie = `settings=` + settings_arr.join() + `;max-age=1000`
}

function load_settings() {
	document.documentElement.style.setProperty('--border', settings_arr[0]);
	rotate = settings_arr[1];
	if (settings_arr[2] > 0) { $('.rain').css('display', 'block') }
	else { $('.rain').css('display', 'none') }
	document.documentElement.style.setProperty('--glow', settings_arr[3] + "px");
	document.documentElement.style.setProperty('--text', settings_arr[4]);
	document.documentElement.style.setProperty('--textglow', settings_arr[5] + "px");
	document.documentElement.style.setProperty('--radius', settings_arr[6] + "px");

	document.getElementById("inp").value = settings_arr[0];
	document.getElementById("range1").value = settings_arr[1];
	document.getElementById("range2").value = settings_arr[2];
	document.getElementById("range3").value = settings_arr[3];
	document.getElementById("range4").value = settings_arr[4];
	document.getElementById("range5").value = settings_arr[5];
	document.getElementById("range6").value = settings_arr[6];
}

function clear_list() {
    var item_list = document.getElementsByTagName("div");
    for(var i = item_list.length-1; i >= 0; i--){
        var p = item_list[i];
        if(p.className === "itemDiv"){
            p.parentNode.removeChild(p);
        }
    }
}

function delete_cookie_input(index) {
    input_arr.splice(index, 1);
    document.cookie = `input=` + input_arr.join()
    clear_list()
    for (let i = 0; i < input_arr.length; i++) {
        if (input_arr[i] != "") {print(input_arr[i], i)}
    }
}

function clear_list_cookies() {
    document.cookie = `input=`
    clear_list()
}

function clear_settings_cookies() {
	document.cookie = `settings=${settings_defaults}`
	settings_arr = readCookie("settings").split(",")
	load_settings()
}

function readCookie(name) {
    name += '=';
    for (var ca = document.cookie.split(/;\s*/), i = ca.length - 1; i >= 0; i--)
        if (!ca[i].indexOf(name))
            return ca[i].replace(name, '');
}

document.addEventListener('DOMContentLoaded', function() {
    if (readCookie("input") == undefined || readCookie("settings") == undefined) {
		document.cookie = `input=`
		document.cookie = `settings=${settings_defaults}`
		update_settings()
	}
    input_arr = readCookie("input").split(",")
	settings_arr = readCookie("settings").split(",")
    for (let i = 0; i < input_arr.length; i++) {
        if (input_arr[i] != "") {print(input_arr[i], i)}
    }
	load_settings()
}, false);

/*
$(document).on('change','#inp',function(){
  $("#test_wrapper").css('background-color',""+document.getElementById('inp').value);
});

$(document).on('change','#range4',function(){
  $("#test_wrapper2").css('background-color',""+document.getElementById('range4').value);
});
*/