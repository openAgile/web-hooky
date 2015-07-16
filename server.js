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
      rejectUnauthorized: false,
      url: querySourceUrl,
      headers: {
        'Accept': 'application/json'
      }
    }, function(error, response, body) {

      function sendPost(body) {
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
      }

      function onlyTargetsThatAreStatusChanges(target) {
        return target.name == "Status";
      }

      function projectToPayload(individualBody) {

        function removeMoment(oidTokenWithMoment) {
          var indexOfMomentToken = oidTokenWithMoment.lastIndexOf(':');
          return oidTokenWithMoment.substring(0, indexOfMomentToken);
        }

        function getAssetTypeAndId(oidTokenWithMoment) {
          var withoutMoment = removeMoment(oidTokenWithMoment);
          return withoutMoment.replace(':', '/');
        }

        var payload = {};
        payload.object = {
          id: removeMoment(individualBody.body.object.id),
          assetType: individualBody.body.object.assetType,
          displayName: individualBody.body.object.displayName,
          number: individualBody.body.object.number,
          assetState: individualBody.body.object.assetState,
          scope: removeMoment(individualBody.body.object.scope)
        };

        payload.summary = individualBody.body.summary;
        payload.event = "StatusChange";
        payload.assetUrl = "rest-1.v1/Data/" + getAssetTypeAndId(individualBody.body.object.id);

        var statusChangeTarget = _.filter(individualBody.body.target, onlyTargetsThatAreStatusChanges)[0];

        payload.newStatus = statusChangeTarget ? statusChangeTarget.newValue : 'REMOVETHIS';

        return payload;
      }

      if (!error) {
        var data = JSON.parse(body);
        console.log('\nGET successful, fetched ' + body.length + ' byes from ' + queryUrlNoCreds);

        if (queryResultJsonIgnore !== undefined && body === queryResultJsonIgnore) {
          console.log('Nothing new found, not executing POST to webhook ' + hookUrl);
          return done();
        }

        if (queryResultJsonIgnore !== undefined
          && body !== queryResultJsonIgnore
          && queryRequeryProperty
          && queryRequeryParamsTemplate) {

          if (queryResultType === 'array') {
            queryRequeryValue = _.get(data[queryResultItemIndex], queryRequeryProperty);

            var itemsWithStatusChanges = _.filter(data, function(item) {
              return _.some(item.body.target, onlyTargetsThatAreStatusChanges);
            });

            var postsMade = 0;
            _.forEach(itemsWithStatusChanges, function(individualBody) {
              postsMade++;
              sendPost(JSON.stringify(projectToPayload(individualBody)));
            });

            if (postsMade > 0) {
              console.log('Found ' + postsMade + ' events with Status changes and POSTed to webhook ' + hookUrl);
            } else {
              console.log('Nothing with Status changes found, not executing POST to webhook ' + hookUrl);
            }
          } else {
            // NOTE: this case is not reached when using this code with VersionOne Activity Stream,
            // since it always returns an Array. It's only hear for speculative reuse purposes and
            // wide-eyed dreams of generic reuse.
            queryRequeryValue = _.get(data, queryRequeryProperty);
            if (_.some(data.body.target, onlyTargetsThatAreStatusChanges)) {
              sendPost(projectToPayload(data));
            }
          }
          console.log('Found the queryRequeryValue: ' + queryRequeryValue);
          done();
        }
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
    delete pollers[req.params.id];
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
    delete pollers[key];
    count++;
  });
  res.send('Stopped ' + count + ' of ' + keys.length + ' webhook jobs');
});

app.listen(PORT);
