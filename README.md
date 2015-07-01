# web-hooky
Performs a GET against a source `queryUrl` and requries per `queryInterval`, then does a POST to `hookUrl`. You can specify Basic auth credentials and other options.

# Getting started

## Install and start

* Install Node.js if you don't already have it.
* Clone this repo, then from bash:

```bash
npm install
npm start
```
## Create a Webhook for a source and target

 Now you must POST the definition of a hook to the server at `/hook`. 
 
### Example:

Using cURL:

```bash
curl -i -X POST \
   -H "Content-Type:application/json" \
   -d \
'{
  	"queryCreds": "admin:admin",
  	"queryUrl": "https://www14.v1host.com/v1sdktesting/api/ActivityStream/Story%3a1124",
  	"queryRequeryParamsTemplate": "activityId=:body.id&direction=forward",
  	"queryInterval": 5000,
  	"hookUrl": "http://requestb.in/ol98pmol"
 }' \
 'http://localhost:9090/hook'
```

# JSON payload parameters

## queryUrl

The source URL to query and requery at a specified interval

example: "https://www7.v1host.com/V1Production/api/ActivityStream/Scope%3a653184"

## hookUrl

The target URL to which the results of querying and requerying `queryUrl` will be POSTed

example: http://requestb.in/o0uouoo0

## queryInterval

Polling interval in milliseconds

example: 5000

## queryRequeryParamsTemplate

A template for additional query parameters to include on requery attempts

example: for VersionOne Activity Stream, it's "activityId=:body.id&direction=forward"

## More  

There are other defaults inside the code that currently apply to VersionOne Activity Stream.
