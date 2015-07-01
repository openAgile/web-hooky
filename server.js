var PORT = process.env.PORT || 9090;

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
  var queryUrlNoCreds = queryUrl;
  var queryRequeryParamsTemplate = hook.queryRequeryParamsTemplate || null;
  var queryRequeryProperty = hook.queryRequeryProperty || 'body.id';
  var queryResultType = hook.queryResultType || 'array';
  var queryResultItemIndex = hook.queryResultItemIndex || 0;
  // In the form of body[0].id or body.id
  var queryRequeryValue = null;
  var queryResultJsonIgnore = hook.queryResultJsonIgnore || '[]';
  var queryProtocol = 'http';

  if (queryUrl.indexOf('http://') === 0) {
    queryUrl = queryUrl.substr(7);
  } else if (queryUrl.indexOf('https://') === 0) {
    console.log('queryUrl:');
    queryUrl = queryUrl.substr(8);
    queryProtocol = 'https';
    console.log(queryUrl + '->' + queryProtocol);
  }
  var queryInterval = hook.queryInterval || 5000;
  var hookUrl = hook.hookUrl;

  var queryUrlInitial = queryProtocol + '://' + queryCreds + '@' + queryUrl;

  console.log('init:' + queryUrlInitial);

  var poller = new TimerJob({
    interval: queryInterval
  }, function(done) {
    var querySourceUrl = queryUrlInitial;

    if (queryRequeryValue) {
      querySourceUrl = queryUrlInitial + '?' + queryRequeryParamsTemplate.replace(':' + queryRequeryProperty, queryRequeryValue);
    } 

    request({
      url: querySourceUrl,
      headers: {
        'Accept': 'application/json'
      }
    }, function(error, response, body) {
      if (!error) {
        var data = JSON.parse(body);
        console.log('\nGET successful, fetched ' + body.length + ' byes from ' + queryUrlNoCreds);
        console.log('POSTing now to: ' + hookUrl);

        if (queryResultJsonIgnore !== undefined
          && body !== queryResultJsonIgnore
          && queryRequeryProperty
          && queryRequeryParamsTemplate) {

          if (queryResultType === 'array') {
            queryRequeryValue = _.get(data[queryResultItemIndex], queryRequeryProperty);
          } else {
            queryRequeryValue = _.get(data, queryRequeryProperty);
          }
          console.log('Found the queryRequeryValue: ' + queryRequeryValue);
        }

        if (queryResultJsonIgnore !== undefined && body === queryResultJsonIgnore) {
          console.log('Nothing new found at, not executing POST to webhook ' + hookUrl);
          return done();
        }

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
        console.error('Error when sending GET to: ' + queryUrlNoCreds);
        console.error(error);
        done();
      }
    });
  });
  poller.start();
  var id = uuid.v4();
  pollers[id] = poller;
  res.send('Created webhook job with id: ' + id + ' that will query from: ' + queryUrlNoCreds + ' and post to: ' + hookUrl);
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
  res.send('Stopped ' + count + ' of ' + keys.length + ' webhook jobs');
});

app.listen(PORT);
