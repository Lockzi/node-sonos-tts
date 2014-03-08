/*jslint indent: 2, maxlen: 80, continue: true, node: true, regexp: true*/
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

  var server = http.createServer(function (req, res) {
    req.setEncoding("utf8");

    var params = req.url.toLowerCase().substring(1).split('/'),
      opt;

    // handle the routes
    if (req.method == 'POST') {
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
          console.log("allZones");
          var player;
          var zoneSize = 0;
          var biggestZone;
          var playerState = [];
          var cordinatorState = [];

          var ttsVolume = parseInt(decodedBody.vol, 10);

          var asyncSeries = [];

          //Walk through all zones and backup the zone configuration.
          discovery.getZones().forEach(function (zone) {
            player = discovery.getPlayerByUUID(zone.uuid);
            cordinatorState[zone.uuid] = player.getState();
            //While looping through, might as well find the biggest one.
            if (zone.members.length > zoneSize) {
              zoneSize = zone.members.length;
              console.log(player.roomName + " - Zone size: " + zoneSize);
              biggestZone = zone.uuid;
              console.log(player.roomName + " - Biggest zone: " + biggestZone + " Name: " + player.roomName);
            }
          });

          //Not necissary! Tried it and no bugs arrive due to taking it away?
          // var cordinator = discovery.getPlayerByUUID(biggestZone);
          // console.log(cordinator.groupState.mute);
          // if (cordinator.groupState.mute === true) {
          //   cordinator.groupMute(false);
          // }

          //Loop through each individual player and backup player configuration
          //We are mainly after specific volume and elapsed time on current track
          for (var i in discovery.players) {

            player = discovery.players[i];
            playerState.push(player.getState());

            //Player state already stored, it's safe to unmute if muted
            if (player.state.mute === true) {
              player.mute(false, function (success) {
                  console.log("mute success: " + success);
                  if(success !== true) {
                    console.log(player.roomName + " - Failed unmuting." + success);
                  }
                });
            };

            //Now, while looping through each player, let's group it to the biggest group
            var streamUrl = "x-rincon:" + biggestZone;

            if (player.avTransportUri !== streamUrl & player.uuid !== biggestZone) {
              //Player is not the cordinator and not in the biggest group, let's add
              asyncSeries.push(function (player, streamUrl) {
                return function (callback) {
                  player.setAVTransportURI(streamUrl, null, function (success) {
                    if (success !== true) {
                      console.log(player.roomName + " - was player.avTransportUri: " + player.avTransportUri);
                      console.log(player.roomName + " - set player.avTransportUri: " + streamUrl);
                      console.log(player.roomName + " - Success grouping? " + success);                      
                    };
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

            //Run the action series
            async.series(asyncSeries, function (err, result) {
              //if (preset.state != "stopped")
              //  coordinator.play();
              if (err) {
                console.log("Ran Async Series with error: " + utils.inspect(err) + ", and result: " + utils.inspect(result));
              } else {
                console.log("Ran Async Series with result: " + utils.inspect(result));
              }
            });
          }

          player = discovery.getPlayerByUUID(biggestZone);

          var streamUrl = SonosTTS.getTTSURI(decodedBody.inputText, req);
          console.log("StreamURL: " + streamUrl);

          if (player.avTransportUri !== streamUrl) {
            //Cordinator is not currently playing the TTS Message
            console.log("Cordinator: " + player.roomName + "->player.avTransportUri: " + player.avTransportUri);
            asyncSeries.push(function (player, streamUrl) {
              return function (callback) {
                player.setAVTransportURI(streamUrl, null, function (success) {
                  console.log("Success playing TTS? " + success);
                  callback(success ? null : "error", success);
                });
              };
            }(player, streamUrl));
          } else {
            console.log("Playing already!? :S");
          }





          //console.log(utils.inspect(playerState));
          //console.log(utils.inspect(cordinatorState));

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

    } else if(params[0] === "stream") {

    } else {
      // for GET requests, serve up the contents in 'index.html'
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(html);
    }

  });

  function handleAction(options, callback) {
    console.log(options);

    if (options.action === "zones") {
      callback(discovery.getZones());
      return;
    }

    if (options.action == "preset") {
      // Apply preset
      var value = decodeURIComponent(options.value);
      if (value.startsWith('{'))
        var preset = JSON.parse(value);
      else
        var preset = presets[value];

      console.log("applying preset", preset);

      if (preset)
        discovery.applyPreset(preset);

      callback();
      return;
    }

    var roomName = decodeURIComponent(options.room);
    var player = discovery.getPlayer(roomName);
    if (!player) {
      callback();
      return;
    }

    callback();

  }

  server.listen(port);

  console.log("http server listening on port", port);
}

module.exports = HttpAPI;