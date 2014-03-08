/*jslint indent: 2, maxlen: 80, continue: true, node: true, regexp: true*/
"use strict";

var path = require("path"),
  fs = require('fs'),
  request = require('request');

var WEBROOT = path.join(path.dirname(__filename), '../', 'webroot');
console.log("WEBROOT: " + WEBROOT);

function TextToSpeech() {
}

TextToSpeech.prototype.convertTextToFilename = function (text) {
  var filename = text.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase() + ".mp3";

  return filename;
}

TextToSpeech.prototype.convertFilenameToFilepath = function (filename) {
  var filepath = WEBROOT + "/messages/" + filename;

  return filepath;
}

TextToSpeech.prototype.convertTextToFilepath = function (text) {
  var filename = this.convertTextToFilename(text),
    filepath = this.convertFilenameToFilepath(filename);

  return filepath;
}

TextToSpeech.prototype.verifyFileExistance = function(filepath, callback) {
  //console.log("verifyFileExistance filepath: " + filepath);
  fs.stat(filepath, function (err, stat) {
    if (err) {
      return callback(new Error('Filepath does not exist'), filepath);
      //return err;
    }
    console.log("Streaming file exists!");
    callback(null, filepath, stat.size);

  });
}

TextToSpeech.prototype.generateTTS = function(text, callback) {
  //x-rincon-mp3radio://translate.google.com/translate_tts?tl=en&q=Hello

  var filepath = this.convertTextToFilepath(text);
  var filename = this.convertTextToFilename(text);

  //console.log("getTTS filepath: " + filepath);

  //Check if message has already been downloaded

  this.verifyFileExistance(filepath, function (err, filepath, size) {
    if (err) {
      err = null;
      //File does not exists, time to download and save mp3 file for message
      var downloadfile = "http://translate.google.com/translate_tts?q="
        + text + "&tl=en";

      request(downloadfile, function (err) {
        if (err) {
          throw new Error(console.log(err));
        }
      }).pipe(fs.createWriteStream(filepath));

      console.log("Downloaded new message from Google TTS Service.");

    } else {
      //File already exists for this message
      console.log("TTS Message cached at: " + filepath);
    }

    callback(null, filename);
  });

  return;

}

//action TTSALL
TextToSpeech.prototype.getTTSURI = function (text, req) {
  console.log("Text-To-Speech all players");

  //Use setTimeout to restore the Zone configuration pre TTS in the future after set time
  //setTimeout(function () { resumeAll(); }, options.value*1000*60);

  this.generateTTS(text, function (err, TTS) {
    if (err) { throw err; }
    //console.log("TTS: " + TTS);

    var TTSURI = "http://" + req.headers.host + "/stream/" + TTS;
    //var TTSURI = "x-rincon-mp3://10.0.3.215:5005/stream/" + TTS;

    return TTSURI;

  });
}


TextToSpeech.prototype.stream = function (text, callback) {
  console.log("Streaming action!");

  var filepath = this.convertTextToFilepath(text);

  //Verify that messagefile actually exists
  this.verifyFileExistance(filepath, function (err, filepath, size) {

    var contentLength = size;

    if (err) {
      //Streaming file does not exist, load error message.
      console.log("Stream called a file that doesn't exist. Stream error message instead!");

      //Changing to Error file
      filepath = this.convertTextToFilepath("Error. Message does not exist");

      console.log("Error filepath: " + filepath);

      this.verifyFileExistance(filepath, function (err, filepath, size) {
        if (err) {
          //Error message does not exist either - major failure!
          console.log("Major Error!");
          return callback(new Error("Stream did not exist so we tried streaming error message but that file did not exist either! Fatal!"));
          //return callback(new Error("Major failure: HALT!"));
        }
        contentLength = size;
      });
    }
    callback(null, filepath, contentLength);
  });
}

module.exports = new TextToSpeech;