/*jslint indent: 2, maxlen: 254, maxerr: 254 continue: true, node: true, regexp: true vars: true*/
"use strict";

var http = require('http');
var fs = require('fs');
var querystring = require('querystring');
var utils = require('util');
var async = require("async");
var SonosTTS = require('./text-to-speech.js');

function HttpAPI(discovery, port, presets) {
  // store the contents of 'index.html' to a buffer
  var html = fs.readFileSync('../webroot/usage.html');

  //Scope variables
  var biggestZone;
  var playerState = [];
  var coordinatorState = [];
  var coordinator;
  var player;

  function runSeries(series) {
    //Run the action series
    async.series(series, function (err, result) {
      //if (preset.state != "stopped")
      //  coordinator.play();
      if (err) {
        console.log("Ran Async Series with error: " + utils.inspect(err) + ", and result: " + utils.inspect(result));
      } else {
        console.log("Ran Async Series with result: " + utils.inspect(result));
      }
      return;
    });
  }

  function setupPartyMode(decodedBody, callback) {
    console.log("allZones");
    var asyncSeries = [];
    var i;
    var zoneSize = 0;

    var ttsVolume = parseInt(decodedBody.vol, 10);

    //Walk through all zones and backup the zone configuration.
    discovery.getZones().forEach(function (zone) {
      player = discovery.getPlayerByUUID(zone.uuid);
      coordinatorState[zone.uuid] = player.getState();
      //While looping through, might as well find the biggest one.
      if (zone.members.length > zoneSize) {
        zoneSize = zone.members.length;
        console.log(player.roomName + " - Zone size: " + zoneSize);
        biggestZone = zone.uuid;
        console.log(player.roomName + " - Biggest zone: " + biggestZone + " Name: " + player.roomName);
      }
    });

    coordinator = discovery.getPlayerByUUID(biggestZone);

    //Not necissary! Tried it and no bugs arrive due to taking it away?
    // var coordinator = discovery.getPlayerByUUID(biggestZone);
    // console.log(coordinator.groupState.mute);
    // if (coordinator.groupState.mute === true) {
    //   coordinator.groupMute(false);
    // }

    //Loop through each individual player and backup player configuration
    //We are mainly after specific volume and elapsed time on current track
    for (i in discovery.players) {

      player = discovery.players[i];
      playerState.push(player.getState());

      //Player state already stored, it's safe to unmute if muted
      if (player.state.mute === true) {
        player.mute(false, function (success) {
          console.log("mute success: " + success);
          if (success !== true) {
            console.log(player.roomName + " - Failed unmuting." + success);
          }
        });
      }

      //Now, while looping through each player, let's group it to the biggest group
      var streamUrl = "x-rincon:" + biggestZone;

      if (player.avTransportUri !== streamUrl && player.uuid !== biggestZone) {
        //Player is not the coordinator and not in the biggest group, let's add
        asyncSeries.push(function (player, streamUrl) {
          return function (callback) {
            player.setAVTransportURI(streamUrl, null, function (success) {
              if (success !== true) {
                console.log(player.roomName + " - was player.avTransportUri: " + player.avTransportUri);
                console.log(player.roomName + " - set player.avTransportUri: " + streamUrl);
                console.log(player.roomName + " - Success grouping? " + success);
              }
              callback(success ? null : "error", success);
            });
          };
        }(player, streamUrl));
      }

      //Check volume
      if (player.state.volume !== ttsVolume) {
        //And set the player volume to the specified TTS volume.
        asyncSeries.push(function (player, volume) {
          return function (callback) {
            player.setVolume(volume, function (success) {
              console.log(player.roomName + " - Success setting volume from: " + player.state.volume + " to ttsVolume: " + volume + "? " + success);
              callback(null, success);
            });
          };
        }(player, ttsVolume));
      }
    }

    callback(asyncSeries);

  }

  function setStream(coordinatorStreamUrl, callback) {
    var asyncSeries = [];

    console.log("coordinatorStreamUrl: " + coordinatorStreamUrl);

    if (coordinator.avTransportUri !== coordinatorStreamUrl) {
      //coordinator is not currently playing the TTS Message
      console.log("coordinator: " + coordinator.roomName + "->coordinator.avTransportUri: " + coordinator.avTransportUri);
      asyncSeries.push(function (coordinator, coordinatorStreamUrl) {
        return function (callback) {
          coordinator.setAVTransportURI(coordinatorStreamUrl, null, function (success) {

            console.log("Set coordinatorStreamUrl: " + coordinatorStreamUrl);
            console.log("Success playing TTS? " + success);
            callback(success ? null : "error", success);
          });

          coordinator.play();

        };
      }(coordinator, coordinatorStreamUrl));
    } else {
      console.log("Playing already!? :S");
    }

    callback(asyncSeries);

  }

  var server = http.createServer(function (req, res) {
    req.setEncoding("utf8");

    var params = req.url.toLowerCase().substring(1).split('/');

    // handle the routes
    if (req.method === 'POST') {
      console.log("POST!");
      var fullBody = '';

      req.on('data', function (chunk) {
        // append the current chunk of data to the fullBody variable
        fullBody += chunk.toString();
        console.log("Chunk: " + chunk);
      });

      req.on('end', function () {
        console.log("End");
        console.log("fullBody: " + fullBody);

        // request ended -> do something with the data
        res.writeHead(200, "OK", {
          'Content-Type': 'text/html'
        });

        // parse the received body data
        var decodedBody = querystring.parse(fullBody);

        if (decodedBody.allZones === "on") {

          setupPartyMode(decodedBody, function (series) {
            return runSeries(series);
          });

          SonosTTS.getTTSURI(decodedBody.inputText, req, function (coordinatorStreamUrl) {
            setStream(coordinatorStreamUrl, function (series) {
              return runSeries(series);
            });
          });


          discovery.on('transport-state', function (state) {
            if (state.uuid === coordinator.uuid && coordinator.state.playerState === "STOPPED") {
              console.log("Stopped! ;)");
            }
          });

          //console.log(utils.inspect(playerState));
          //console.log(utils.inspect(coordinatorState));
        }

        console.log("Input text: " + decodedBody.inputText);

        // output the decoded data to the HTTP response
        var output = "";
        output = '<html><head><title>Post data</title></head><body><pre>';
        output += utils.inspect(decodedBody);
        output += '</pre></body></html>';

        console.log("Output: " + output);
        res.end(output);

      });

    } else if (params[0] === "stream" && params[1].length >= 1) {

      console.log("Incoming Stream request!");

      SonosTTS.stream(params[1], function (err, filepath, size) {
        if (err) { throw err; }

        console.log("filename: " + params[1]);

        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': size,
          'Cache-Control': 'no-cache'
        });

        var readStream = fs.createReadStream(filepath);

        // This catches any errors that happen while creating
        // the readable stream (usually invalid names)
        readStream.on('error', function (err) {
          //Content type will be wrong, but who cares.
          res.end(err);
        });

        // This will wait until we know the readable stream
        // is actually valid before piping
        readStream.on('open', function () {
        // This just pipes the read stream to the response
        // object (which goes to the client)
          console.log("Reading stream!");
          readStream.pipe(res);
        });

        readStream.on('end', function () {
          res.end();

          console.log("Piped!");
        });

      });

    } else {
      // for GET requests, serve up the contents in 'index.html'
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(html);
    }

  });

  server.listen(port);

  console.log("http server listening on port", port);
}

module.exports = HttpAPI;