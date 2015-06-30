var PORT = process.env.PORT || 9090;

/* Example usage:

To start:

First:

npm install
npm start

Second:

You must POST the definition of a hook to the server at /hook. Example:

The queryUrl should be without the http:// or https://, like:

  www7.v1host.com/V1Production/api/ActivityStream/Scope%3a653184?instart_disable_injection=true

It is the URL for where to read data from, coupled with the creds and protocol.

The hookUrl should have the full address like:

  http://requestb.in/o0uouoo0

After reading from queryUrl, the server will turn around and POST the data it gets to hookUrl.

queryInterval is in milliseconds. 

Using cURL:

curl -i -X POST \
   -H "Content-Type:application/json" \
   -d \
'{
  "queryCreds": "jogoshugh:SECRET",
  "queryUrl": "www7.v1host.com/V1Production/api/ActivityStream/Scope%3a653184",
  "queryProtocol": "https",
  "queryInterval": 5000,
  "hookUrl": "http://requestb.in/o0uouoo0"
 }' \
 'http://localhost:9090/hook'

*/

var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var TimerJob = require('timer-jobs');
var uuid = require('uuid');
var _ = require('lodash');

var app = express();
app.use(bodyParser.json());

var pollers = {};

app.post('/hook', function(req, res) {
  'use strict';
  var hook = req.body;
  var queryCreds = hook.queryCreds;
  var queryUrl = hook.queryUrl;
  var queryProtocol = hook.queryProtocol || 'https';
  var queryInterval = hook.queryInterval || 5000;
  var hookUrl = hook.hookUrl;

  queryUrl = queryProtocol + '://' + queryCreds + '@' + queryUrl;

  var poller = new TimerJob({
    interval: queryInterval
  }, function(done) {
    request({
      url: queryUrl,
      headers: {
        'Accept': 'application/json'
      }
    }, function(error, response, body) {
      if (!error) {
        console.log('GET successful, fetched this many bytes from ' + hook.queryUrl + ': ' + body.length);
        console.log('POSTing now to: ' + hookUrl);
        request.post({
          headers: {
            'Content-Type': 'application/json'
          },
          url: hookUrl,
          body: body
        }, function(err, resp, bod) {
          if (err) {
            console.error('Error when sending POST to: ' + hookUrl);
            console.error(err);
            done();
          } else {
            console.log('POST successful, response data:');
            console.log(bod);
            done();
          }
        });
      } else {
        console.error('Error when sending GET to: ' + hook.queryUrl);
        console.error(error);
        done();
      }
    });
  });
  poller.start();
  var id = uuid.v4();
  pollers[id] = poller;
  res.send('Created webhook job with id: ' + id + ' that will query from: ' + hook.queryUrl + ' and post to: ' + hook.hookUrl);
});

app.get('/hooks', function(req, res) {
  res.json(_.keys(pollers));
});

app.delete('/hook/:id', function(req, res) {
  if (pollers[req.params.id]) {
    pollers[req.params.id].stop();
    res.send('Stopped webhook job with id: ' + req.params.id);
  } else {
    res.send('Could not find webhook job with id: ' + req.params.id);
  }
});

app.delete('/hooks', function(req, res) {
  var keys = _.keys(pollers);
  var count = 0;
  _.each(keys, function(key) {
    pollers[key].stop();
    count++;
  });
  res.send('Stopped ' count + ' of ' + keys.length + ' webhook jobs');
});

app.listen(PORT);
