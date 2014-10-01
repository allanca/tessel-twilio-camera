var https = require('https');
var request = require('request');
var twilio = require('twilio');

// TODO: Signup with Twilio and Imgur and add your credentials here.
var imgurClientId = "[IMGUR_CLIENT_ID]"
var account_sid = "[TWILIO_ACCOUNT_SID]";
var auth_token = "[TWILIO_AUTH_TOKEN]";
var sourceNumber = "[TWILIO_SOURCE_NUMBER]";
var targetNumber = "[YOUR_PHONE_NUMBER]";
var client = twilio(account_sid, auth_token);

// Load these last: https://github.com/tessel/camera-vc0706/issues/30
var tessel = require('tessel');
var camera = require('camera-vc0706').use(tessel.port['A']);
var accel = require('accel-mma84').use(tessel.port['B']);

// Set up an LED to notify when we're taking a picture
var notificationLED = tessel.led[1];

// Wait for the camera module to say it's ready
console.log('starting camera');

var cameraReady = false;
camera.on('ready', function () {
  cameraReady = true;
});

camera.on('error', function(err) {
  console.error(err);
});


// Initialize the accelerometer
var last_movement = 0.0;
var last_movement_time = 0;

// Initialize the accelerometer
console.log("starting accelerometer");
accel.on('ready', function () {
  console.log("accelerometer ready");

  // Stream accelerometer data
  accel.setOutputRate(1.56, function rateSet() {
    accel.setScaleRange( 8, function scaleSet() {
      accel.on('data', function (xyz) {
        if (last_movement !== xyz[0].toFixed(1)) {
          last_movement = xyz[0].toFixed(1);

          var seconds = (Date.now() -  last_movement_time) / 1000;

          // Only send a picture once a minute
          if (seconds > 60) {
            console.log("accelerometer", seconds, last_movement, last_movement_time);

            if (sendPicture()) {
              last_movement_time = Date.now();
            }
          }
        }
      });
    });
  });
});

accel.on('error', function(err) {
  console.log('Error:', err);
});

// Take and send a picture, but only allow one picture to be in flight at a time.
var sendingPicture = false;
var sendPicture = function () {
  if (!cameraReady || sendingPicture) {
    console.log('not ready to send picture', cameraReady, sendingPicture);
    return false;
  }

  sendingPicture = true;

  notificationLED.high();

  // Take the picture
  console.log('taking picture');
  camera.takePicture(function(err, image) {
    notificationLED.low();

    if (err) {
      console.log('error taking image', err);
      sendingPicture = false;
      return;
    }

    console.log('picture taken');

    // Name the image
    var name = 'picture-' + Math.floor(Date.now()*1000) + '.jpg';

    console.log('uploading picture');

    // Upload to imgur
    uploadPicture(image, imgurClientId, function(err, res) {
      if (err) {
        console.log('error uploading picture', err);
        sendingPicture = false;
        return;
      }
      console.log('picture uploaded', res.data.link);

      // Send the image via MMS
      console.log('sending message', res.data.link);
      client.messages.create({
          body: "Go, Go, Gadget Camera!",
          to: targetNumber,
          from: sourceNumber,
          mediaUrl: res.data.link
      }, function(err, message) {
        if (err) {
          console.log('error sending message', err);
          sendingPicture = false;
          return;
        }

        console.log('message sent', message.sid);
        sendingPicture = false;
      });

    });
  });

  return true;
};

var uploadPicture = function(image, clientId, callback) {
  if (clientId && image) {
    var options = {
        uri: 'https://api.imgur.com/3/upload',
        headers: {
         'Authorization': 'Client-ID ' + clientId
        }
    };

    var post = request.post(options, function(err, req, body) {
      try {
        callback(err, JSON.parse(body));
      } catch(e) {
        callback(err, body);
      }
    });

    var upload = post.form();
    upload.append('type', 'file');
    upload.append('image', image);
  }
};
