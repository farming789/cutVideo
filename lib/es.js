var esConfig=require('../config/es');

const { Client } = require('@elastic/elasticsearch');

var client;
if(esConfig){
   client = new Client({ node: esConfig.host })
}

module.exports.update=(id,index,body,callback)=>{
  if(!client){
    console.warn("未连接es服务器！");
  }
    client.update({
            index: index,
            id:id,
            type: index,
            body:body
        },
        (err, result) => {
            if(callback){
                callback(err,result);
            }
        });
}

