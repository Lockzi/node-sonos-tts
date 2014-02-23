var http = require('http');
var SonosDiscovery = require('sonos-discovery');
var SonosTTS = require('./lib/text-to-speech.js');
var fs = require('fs');
var discovery = new SonosDiscovery();
var port = 5006;

var presets = {};

fs.exists('./presets.json', function (exists) {
	if (exists) {
		presets = require('./presets.json');
		console.log('loaded presets', presets);
	} else {
		console.log('no preset file, ignoring...');
	}
	new SonosTTS(discovery, port, presets);
});

