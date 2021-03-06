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
  var coordinatorState;
  var coordinator;
  var player;

  function runSeries(series, log) {
    //Run the action series
    async.series(series, function (err, result) {
      //if (preset.state != "stopped")
      //  coordinator.play();
      if (log !== undefined) {
        console.log(log);
      }
      if (err) {
        console.log("Ran Async Series with error: " + utils.inspect(err) + ", and result: " + utils.inspect(result));
      } else {
        console.log("Ran Async Series with result: " + utils.inspect(result));
      }

      return;
    });
  }

  function runParallel(parallel, log) {
    //Run the action Parallel
    async.parallel(parallel, function (err, result) {
      //if (preset.state != "stopped")
      //  coordinator.play();
      if (err) {
        console.log("Ran Async Parallel with error: " + utils.inspect(err) + ", and result: " + utils.inspect(result));
      } else {
        console.log("Ran Async Parallel with result: " + utils.inspect(result));
      }

      if (log !== undefined) {
        console.log(log);
      }
      return;
    });
  }

  function sleep(time, callback) {
    /* This blocks thread! */
    var stop = new Date().getTime();
    console.log("Sleeping for: " + time + " milliseconds!");
    while (new Date().getTime() < stop + time) {
      ;
    }
    callback();
  }

  function playerAdded(transport) {
    console.log("PlayerAdded ranned!");
    console.log("playerAdded: " + utils.inspect(transport, true, 7));
    return true;
  }

  function setupPartyMode(decodedBody, callback) {
    discovery.removeListener("topology-change", playerAdded);
    discovery.on("topology-change", playerAdded);

    console.log("allZones");
    var asyncSeries = [];
    var i;
    var zoneSize = 0;

    var ttsVolume = parseInt(decodedBody.vol, 10);

    coordinatorState = discovery.getZones();
    //Walk through all zones and backup the zone configuration.
    coordinatorState.forEach(function (zone) {
      player = discovery.getPlayerByUUID(zone.uuid);
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
      //var coordinatorUUID = player.coordinator.uuid;
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

  function restorePlayer(coordinatorUUID, uuid, backup) {
    var asyncSeries = [];

    player = discovery.getPlayerByUUID(uuid);


    // console.log("backup: ");
    // console.log(utils.inspect(backup, false, 7));

    //var streamUrl = "x-rincon:" + coordinatorUUID;

    //if (player.avTransportUri !== streamUrl && player.uuid !== coordinatorBackedUp.uuid) {
    // console.log("restorePlayer - " + player.roomName + " player.avTransportUri: " + player.avTransportUri);
    // console.log("restorePlayer - " + player.roomName + " streamUrl: " + streamUrl);
    // console.log("restorePlayer - " + player.roomName + " player.uuid: " + player.uuid);
    // console.log("restorePlayer - " + player.roomName + " uuid: " + uuid);
    // console.log("restorePlayer - " + player.roomName + " coordinatorUUID: " + coordinatorUUID);

    asyncSeries.push(function (player, stream) {
      return function (callback) {
        player.setAVTransportURI(stream, null, function (success) {
          console.log("Attempting grouping");
          if (success !== true) {
            console.log(player.roomName + " - was player.avTransportUri: " + player.avTransportUri);
            console.log(player.roomName + " - set player.avTransportUri: " + stream);
          }

          console.log(player.roomName + " - Success grouping? " + success);

          callback(success ? null : "error", success);
        });
      };
    }(player, backup.avTransportUri));

    //Player state already stored, it's safe to unmute if muted
    asyncSeries.push(function (player, backup) {
      return function (callback) {
        if (player.state.mute !== backup.state.mute) {
          console.log("Switching mute to: " + backup.state.mute);
          player.mute(backup.state.mute, function (success) {
            console.log("mute success: " + success);
            if (success !== true) {
              console.log(player.roomName + " - Failed unmuting." + success);
            }

            callback(success ? null : "error", success);
          });
        }
      };
    }(player, backup));

    // //Check volume
    if (player.state.volume !== backup.state.volume) {
      //And set the player volume to the backed up volume
      asyncSeries.push(function (player, volume) {
        return function (callback) {
          player.setVolume(volume, function (success) {
            console.log(player.roomName + " - Success setting volume from: " + player.state.volume + " to backed up volume: " + volume + "? " + success);
            callback(success ? null : "error", success);
          });
        };
      }(player, backup.state.volume));
    }

    if (coordinatorUUID === uuid) {
      // //Seek track
      if (player.state.elapsedTime !== backup.state.elapsedTime) {
        //And set the player volume to the backed up volume
        asyncSeries.push(function (player, trackSeek) {
          return function (callback) {
            player.trackSeek(trackSeek, function (success) {
              console.log(player.roomName + " - Success setting elapsed time from: " + player.state.elapsedTime + " to backed up elapsed time: " + trackSeek + "? " + success);
              callback(success ? null : "error", success);
            });
          };
        }(player, backup.state.elapsedTime));
      }

      asyncSeries.push(function (player) {
        return function (callback) {
          player.play(function (success) {
            console.log(player.roomName + " - Success starting playback? " + success);
            callback(success ? null : "error", success);
          });
        };
      }(player));
    }

    return asyncSeries;
  }

  function restoreSonos(callback) {
    var asyncSeries = [];
    //var asyncParallel = [];


    //console.log("coordinatorState: " + utils.inspect(coordinatorState, false, 7));

    console.log("------------------");
    console.log("Backed up grouping");
    console.log("------------------");
    coordinatorState.forEach(function (coordinator) {
      var coordinatorBackedUp = coordinator.coordinator;
      var playerCoordinator = discovery.getPlayerByUUID(coordinatorBackedUp.uuid);
      console.log(playerCoordinator.roomName);

      coordinator.members.forEach(function (member) {
        player = discovery.getPlayerByUUID(member.uuid);
        console.log("--" + player.roomName);
      });
    });

    coordinatorState.forEach(function (coordinator) {

      var coordinatorBackedUp = coordinator.coordinator;
      var playerCoordinator = discovery.getPlayerByUUID(coordinatorBackedUp.uuid);
      player = playerCoordinator;

      //Isolate if not coordinator of biggestZone, otherwise this player is already cordinator with members and does not need to be ungrouped.
      if (playerCoordinator.uuid !== biggestZone) {
        asyncSeries.push(function (callback) {
          playerCoordinator.becomeCoordinatorOfStandaloneGroup(function (success) {
            console.log("Isolated: " + playerCoordinator.roomName + " UUID: " + playerCoordinator.uuid);

            callback(null, player.roomName + " isolated: " + success);
          });
        });
      } else {
        console.log("Coordinator " + playerCoordinator.roomName + " UUID: " + playerCoordinator.uuid + " is the biggest zone - no action!");
      }

      //asyncSeries = asyncSeries.concat(asyncSeries, restorePlayer(playerCoordinator.uuid, playerCoordinator.uuid, coordinatorBackedUp));

      asyncSeries.push(function (player, stream) {
        return function (callback) {
          player.setAVTransportURI(stream, null, function (success) {
            console.log("Attempting grouping");
            if (success !== true) {
              console.log(player.roomName + " - was player.avTransportUri: " + player.avTransportUri);
              console.log(player.roomName + " - set player.avTransportUri: " + stream);
            }

            console.log(player.roomName + " - Success grouping? " + success);

            callback(null, player.roomName + " grouped to coordinator: " + success);
          });
        };
      }(player, coordinatorBackedUp.avTransportUri));

      //Player state already stored, it's safe to unmute if muted

      // if (player.state.mute !== coordinatorBackedUp.state.mute) {
      //   asyncSeries.push(function (player, backup) {
      //     return function (callback) {
      //       console.log("Switching mute to: " + backup.state.mute);
      //       player.mute(backup.state.mute, function (success) {
      //         console.log("mute success: " + success);
      //         if (success !== true) {
      //           console.log(player.roomName + " - Failed unmuting." + success);
      //         }

      //         callback(null, player.roomName + " toggled mute: " + success);
      //       });
      //     };
      //   }(player, coordinatorBackedUp));
      // }

      //Check volume
      // if (player.state.volume !== coordinatorBackedUp.state.volume) {
      //   //And set the player volume to the backed up volume
      //   asyncSeries.push(function (player, volume) {
      //     return function (callback) {
      //       player.setVolume(volume, function (success) {
      //         console.log(player.roomName + " - Success setting volume from: " + player.state.volume + " to backed up volume: " + volume + "? " + success);

      //         callback(null, player.roomName + " restored volume: " + success);
      //       });
      //     };
      //   }(player, coordinatorBackedUp.state.volume));
      // }

      //Seek track
      if (player.state.elapsedTime !== coordinatorBackedUp.state.elapsedTime) {
        //And set the player volume to the backed up volume
        asyncSeries.push(function (player, trackSeek) {
          return function (callback) {
            player.trackSeek(trackSeek, function (success) {
              console.log(player.roomName + " - Success setting elapsed time from: " + player.state.elapsedTime + " to backed up elapsed time: " + trackSeek + "? " + success);

              callback(null, player.roomName + " restored trackSeek: " + success);
            });
          };
        }(player, coordinatorBackedUp.state.elapsedTime));
      }

      if (coordinatorBackedUp.state.playerState === 'PLAYING' && player.state.playerState !== 'PLAYING') {
        asyncSeries.push(function (player) {
          return function (callback) {
            player.play(function (success) {
              console.log(player.roomName + " - Success starting playback? " + success);

              callback(null, player.roomName + " started playback: " + success);
            });
          };
        }(player));
      }





      coordinator.members.forEach(function (member) {
        player = discovery.getPlayerByUUID(member.uuid);

        //asyncSeries = asyncSeries.concat(asyncSeries, restorePlayer(playerCoordinator.uuid, player.uuid, member));

        if (member.uuid !== coordinator.uuid) {
          console.log("grouping uri is: x-rincon:" + coordinator.uuid);
          asyncSeries.push(function (player, stream) {
            return function (callback) {
              player.setAVTransportURI(stream, null, function (success) {
                console.log("Attempting grouping");
                if (success !== true) {
                  console.log(player.roomName + " - was player.avTransportUri: " + player.avTransportUri);
                  console.log(player.roomName + " - set player.avTransportUri: " + stream);
                }

                console.log(player.roomName + " - Success grouping? " + success);

                callback(null, player.roomName + " grouped to coordinator: " + success);
              });
            };
          }(player, "x-rincon:" + member.coordinator));
        }

        //Player state already stored, it's safe to unmute if muted

        if (player.state.mute !== member.state.mute) {
          asyncSeries.push(function (player, backup) {
            return function (callback) {
              console.log("Switching mute to: " + backup.state.mute);
              player.mute(backup.state.mute, function (success) {
                console.log("mute success: " + success);
                if (success !== true) {
                  console.log(player.roomName + " - Failed unmuting." + success);
                }

                callback(null, player.roomName + " toggled mute: " + success);
              });
            };
          }(player, member));
        }

        //Check volume
        if (player.state.volume !== member.state.volume) {
          //And set the player volume to the backed up volume
          asyncSeries.push(function (player, volume) {
            return function (callback) {
              player.setVolume(volume, function (success) {
                console.log(player.roomName + " - Success setting volume from: " + player.state.volume + " to backed up volume: " + volume + "? " + success);

                callback(null, player.roomName + " restored volume: " + success);
              });
            };
          }(player, member.state.volume));
        }

      });

      //console.log("count cordinatorState members: " + coordinator.members.length);

    });

    //runParallel(asyncParallel);

    return callback(asyncSeries);

  }

  function ttsStreamStopped(transport) {
    if (transport.uuid === coordinator.uuid && transport.state.playerState === "STOPPED") {
      discovery.removeListener("transport-state", ttsStreamStopped);
      console.log("Stopped! ;)");
      //console.log("coordinatorState: " + utils.inspect(coordinatorState, false, 7));

      //Do reversing
      restoreSonos(function (series) {
        //console.log("restoreSonos series: " + utils.inspect(series, false, 7));
        return runSeries(series, "sonosRestore series:");
      });
    }
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

          //Delay play 1000ms
          setTimeout(function () {

            coordinator.play(function () {
              discovery.removeListener("transport-state", ttsStreamStopped);
              discovery.on('transport-state', ttsStreamStopped);
            });

          }, 1000);

        };
      }(coordinator, coordinatorStreamUrl));
    } else if (coordinator.avTransportUri === coordinatorStreamUrl && coordinator.state.currentState === "STOPPED") {
      //Delay play 500ms
      //Do we need delay here?
      coordinator.play(function () {
        discovery.removeListener("transport-state", ttsStreamStopped);
        discovery.on('transport-state', ttsStreamStopped);
      });

      discovery.removeListener("transport-state", ttsStreamStopped);
      discovery.on('transport-state', ttsStreamStopped);
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

          var asyncSeriesMaster = [];


          asyncSeriesMaster.push(function (callback) {
            setupPartyMode(decodedBody, function (series) {
              callback(runSeries(series, "setupPartyMode series:"));
            });
          });


          asyncSeriesMaster.push(function (callback) {
            SonosTTS.getTTSURI(decodedBody.inputText, req, function (coordinatorStreamUrl) {
              setStream(coordinatorStreamUrl, function (series) {
                  callback(runSeries(series, "setStream series:"));
              });
            });
          });

          asyncSeriesMaster.push(function (callback) {
            //Walk through all zones and backup the zone configuration.
            console.log("-----------------------------");
            console.log("Actual grouping after restore");
            console.log("-----------------------------");
            discovery.getZones().forEach(function (zone) {
              player = discovery.getPlayerByUUID(zone.uuid);
              //While looping through, might as well find the biggest one.
              console.log(player.roomName);

              zone.members.forEach(function (member) {
                player = discovery.getPlayerByUUID(member.uuid);
                console.log("--" + player.roomName);
              });
            });
            return callback();
          });

          runSeries(asyncSeriesMaster, "asyncSeriesMaster series:");

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