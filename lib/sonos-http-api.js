/*jslint indent: 2, maxlen: 80, continue: true, node: true, regexp: true*/
"use strict";

var http = require('http');
var fs = require('fs');
var SonosTTS = require('./text-to-speech.js');

function HttpAPI(discovery, port, presets) {

  var server = http.createServer(function (req, res) {
    res.writeHead(200, {
      'Content-Type': 'application/json;charset=utf8',
      'Cache-Control': 'no-cache'
    });

    var params = req.url.substring(1).split('/');

    if (params.length < 1 || params[0] == "favicon.ico") {
      // This is faulty.
      res.end();
      return;
    } else if (params.length == 2 && ["preset", "pauseall", "resumeall"].some(function (i) { return params[0] == i; })) {
      // Handle presets
      var opt = {
        action: params[0],
        value: params[1]
      };
    } else if (params.length > 1) {


      var opt = {
        room: params[0],
        action: params[1],
        value: params[2]
      };

    } else {
      // guessing zones
      var opt = {
        action: params[0]
      }
    }

    var response = handleAction(opt, function (response) {
      if (response) {
        var jsonResponse = JSON.stringify(response);
        res.write(new Buffer(jsonResponse));
      }
      res.end();
    });
  });

  function handleAction(options, callback) {
    console.log(options)

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

      console.log("applying preset", preset)

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