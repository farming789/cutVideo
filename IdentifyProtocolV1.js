var url = require('url');
var fs = require('fs');
var crypto = require('crypto');
var request = require('request');

var defaultOptions = {
  host: 'cn-north-1.api.acrcloud.com',
  endpoint: '/v1/identify',
  signature_version: '1',
  data_type: 'audio',
  secure: true,
  access_key: 'e7ef5b3edf6ce7e5873959186d6a3a2a',
  access_secret: 'n6jdRtQEJn6d4tkaIEemR8jdXUa6dt69x1iGvE2V'
};

function buildStringToSign(method, uri, accessKey, dataType, signatureVersion, timestamp) {
  return [
    method,
    uri,
    accessKey,
    dataType,
    signatureVersion,
    timestamp
  ].join('\n');
};

function sign(signString, accessSecret) {
  return crypto.createHmac('sha1', accessSecret).update(new Buffer(signString, 'utf-8')).digest().toString('base64');
};

/**
 * Identifies a sample of bytes
 */
function identify(data, options, cb) {

  var current_data = new Date().zoneDate();
  var timestamp = current_data.getTime() / 1000;
  var stringToSign = buildStringToSign('POST', options.endpoint, options.access_key, options.data_type, options.signature_version, timestamp);
  var signature = sign(stringToSign, options.access_secret);
  var formData = {
    sample: data,
    access_key: options.access_key,
    data_type: options.data_type,
    signature_version: options.signature_version,
    signature: signature,
    sample_bytes: data.length,
    timestamp: timestamp
  }
  //onsole.log(formData);
  process.exit(0);
  request.post({
    url: "http://" + options.host + options.endpoint,
    method: 'POST',
    formData: formData
  }, cb);
};

(() => {
  var bitmap = fs.readFileSync('/Users/njwangchuan/media/s2-cut.m4a');

  identify(new Buffer(bitmap), defaultOptions, function(err, httpResponse, body) {
    if (err) {
      console.log(err);
    } else {
      console.log(body);
    }
  });
})();
