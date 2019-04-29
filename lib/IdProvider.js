var request = require('request');
var tvsonarUrl=require('../config/tvsonarurl');

module.exports.getId=(callback)=>{
    request.get({
        url:tvsonarUrl.url+tvsonarUrl.getId,
        method:'GET',
        json: true
    },function (err, httpResponse, body) {
        if (err) {
            callback(err, null);
        } else if (!(httpResponse.statusCode == 200 || httpResponse.statusCode == 201)) {
             callback(body, null);
        }else {
          console.log(JSON.stringify(body));
          if(body.code==1000){
            if(body.data){
                callback(null,body.data.id);
            }
         }else {
             callback(body,null);
         }
        }
    });
}


module.exports.getIds=(num,callback)=>{
    request.get({
        url:tvsonarUrl.url+tvsonarUrl.getIds+num,
        method:'GET',
        json: true
    },function (err, httpResponse, body) {
        if (err) {
            callback(err, null);
        } else if (!(httpResponse.statusCode == 200 || httpResponse.statusCode == 201)) {
            callback(body, null);
        }else {
            console.log(JSON.stringify(body));
            if(body.code==1000){
                if(body.data&&body.data.length>0){
                    callback(null,body.data);
                }
            }else {
                callback(body,null);
            }
        }
    });
}
