var db = require('../lib/db_none_transational');
var dbFeimu=require('../lib/dbFeimu');
var idProvider=require('../lib/IdProvider');
var async = require('async');
var moment = require('moment');
var es=require('../lib/es');

module.exports.syncProject = (mvOriginItem,callback)=>{
    console.log("即将同步的片源数据："+JSON.stringify(mvOriginItem));
    async.waterfall([(next)=>{
        //同步feimu数据库的project表  片名，作品形式 ，总集数，豆瓣链接
        dbFeimu.query('select * from fm_project where p_name=? and p_delete_flag=1',[mvOriginItem.video_name],next)
    },(rows,fields,next)=>{
        console.log("获取的project数据是："+JSON.stringify(rows));
        if(rows&&rows.length>0){
            next(null,rows[0].p_id)
        }else {
            //如果不存在，则新增一条片源
            insertProject(mvOriginItem,next);
        }
    },(pId,next)=>{
        console.log("对应的片源id是："+ pId);
        //判断feimu数据库的fm_project_episode是否有该剧集
        dbFeimu.query('select * from fm_project_episode where p_id=? and pe_file_name=? and pe_delete_flag=1',[pId,mvOriginItem.file_title],function (error,rows,fields) {
            next(error,pId,rows);
        })
    },(pId,rows,next)=>{
        if(rows&&rows.length>0){
            //如果已经同步了音频，则不做处理
            if(rows[0].pe_audio_status==1){
                next(null,pId,rows[0].pe_id);
            }else {
                updateProjectEpisode(mvOriginItem,rows[0],next)
            }
        }else {
            //如果不存在则，新增片源剧集
            insertProjectEpisode(mvOriginItem,pId,next);
        }
    },(pId,peId,next)=>{
        console.log("对应的片源id和剧集id是："+ pId+","+peId);
        //更新切片数据库的mv_origin表的同步状态,pId,peId
        var newOrigin={};
        newOrigin.id=mvOriginItem.id;
        newOrigin.p_id=pId;
        newOrigin.pe_id=peId;
        newOrigin.sync_status=1;
        newOrigin.sync_at=new Date().zoneDate();
        db.updateTable('mv_origin','id',[newOrigin],next)
    }],function (error,results) {
        if(error){
            var newOrigin={};
            newOrigin.id=mvOriginItem.id;
            newOrigin.sync_status=-1;
            newOrigin.sync_at=new Date().zoneDate();
            db.updateTable('mv_origin','id',[newOrigin],function (err,result) {})
            callback(error,null);
        }else {
            callback(null,results);
        }
    })
}

var insertProject=(mvOrigin,callback)=>{
    var project={};
    async.waterfall([
        (next)=>{
            idProvider.getId(function (error,id) {
                if(error){
                    console.log('插入fm_project表时，获取主键失败');
                    next(error,null);
                }else {
                    project.p_id=id;
                    mvOrigin.p_id=id;
                    project.p_name=mvOrigin.video_name;
                    project.p_toatl_sets=mvOrigin.total_sets;
                    project.p_douban_url=mvOrigin.douban_url;
                    project.p_status=2;
                    project.p_create_time=new Date().zoneDate();
                    project.p_update_time=new Date().zoneDate();
                    next();
                }
            });
        },(next)=>{
            //作品形式
            dbFeimu.query('select * from fm_theme where t_theme_name=? and t_valid_flag=1',[mvOrigin.video_type],function (error,rows,fields) {
                if(error){
                    next(error);
                }else {
                    if(rows&&rows.length>0){
                        project.t_id=rows[0].t_id;
                    }
                    next();
                }
            });
        },(next)=>{
            if(mvOrigin.douban_url&&mvOrigin.douban_url.length>0){
                dbFeimu.query('select * from fm_movie_resources where mr_db_url=? and mr_delete_flag=1',[mvOrigin.douban_url],function (error,rows,fields) {
                    if(error){
                        next(error);
                    }else {
                        console.log("获取的影视剧数据" + JSON.stringify(rows));
                        if(rows&&rows.length>0){
                            project.mr_id=rows[0].mr_id;
                        }
                        next();
                    }
                })
            }else {
                next()
            }
        },(next)=>{
            console.log("新增project:",JSON.stringify(project));
            dbFeimu.insertIgnoreTable('fm_project',[project],next)
        },(results,next)=>{
            if(project.mr_id&&project.mr_id>0){
                var item={};
                item.mr_id=project.mr_id;
                item.p_id=project.p_id;
                console.log("更新fm_movie_resources影视剧表:",JSON.stringify(item));
                dbFeimu.updateTable('fm_movie_resources',"mr_id",[item],function (error,result) {});
            }
            next();
        },
    ],function (error,result) {
        if(error){
            callback(error);
        }else {
            callback(null,project.p_id);
        }
    })
}
var insertProjectEpisode=(mvOrigin,pId,callback)=>{
    var episode={};
    async.waterfall([
        (next)=>{
            idProvider.getId(function (error,id) {
                if(error){
                    console.log('插入fm_project_episode表时，获取主键失败');
                    next(error,null);
                }else {
                    console.log("获取的剧集id是："+id);
                    episode.pe_id=id;
                    episode.p_id=pId;
                    mvOrigin.pe_id=id;
                    if(1 < mvOrigin.total_sets){
                        episode.pe_episode_name="第"+mvOrigin.sets+"集"
                    }
                    episode.pe_file_name=mvOrigin.file_title;
                    episode.pe_sets=mvOrigin.sets;
                    episode.pe_audio_status=1;
                    episode.pe_create_time=new Date().zoneDate();
                    episode.pe_update_time=new Date().zoneDate();
                    next();
                }
            });
        },(next)=>{
            db.query('select * from mv_novideos where file_title=?',[mvOrigin.file_title],function (error,rows,fields) {
                if(error){
                    next(error,null);
                }else {
                    if(rows&&rows.length>0){
                        console.log("音频数据："+JSON.stringify(rows));
                        episode.pe_acr_id = rows[0].acr_id;
                    }
                    next();
                }
            })
        },(next)=>{
            console.log("新增的剧集数据："+JSON.stringify(episode));
            dbFeimu.insertIgnoreTable('fm_project_episode',[episode],next);
        }
    ],function (error,result) {
        if(error){
            console.log("新增剧集失败:"+error);
            callback(error);
        }else {
            callback(null,episode.p_id,episode.pe_id);
        }
    })
}

var updateProjectEpisode=(mvOrigin,episode,callback)=>{
    async.waterfall([
        (next)=>{
            db.query('select * from mv_novideos where file_title=?',[mvOrigin.file_title],function (error,rows,fields) {
                if(error){
                    next(error);
                }else {
                    if(rows&&rows.length>0){
                        episode.pe_acr_id = rows[0].acr_id;
                    }
                    next();
                }
            })
        },(next)=>{
            dbFeimu.query('select pe_audio_status , pe_cut_status, pe_status from fm_project_episode where pe_id=?',[episode.pe_id],next)
        },(rows,fields,next)=>{
            if(rows[0].pe_cut_status==1){
                //更新pe_audio_status和pe_status
                dbFeimu.query('update fm_project_episode set pe_audio_status=1,pe_status=1,pe_acr_id=?, where pe_id=?',[episode.pe_acr_id,episode.pe_id],next);
            }else {
                //仅仅更新pe_audio_status
                dbFeimu.query('update fm_project_episode set pe_audio_status=1,pe_acr_id=? where pe_id=?',[episode.pe_acr_id,episode.pe_id],next);
            }
        },(rows,fields,next)=>{
            syncEs(episode.p_id,next);
        }
    ],function (error,result) {
        if(error){
            callback(error);
        }else {
            callback(null,episode.p_id,episode.pe_id);
        }
    })
}

module.exports.batchSyncEs=()=>{
    var pIds=[];
    db.query("select * from mv_origin  where sync_at>'2019-05-27",null,(error,rows,fields)=>{
        pIds=rows.map(p=>p.p_id);
        async.mapLimit(pIds,1,syncEs,function () {

        })
    })
}

/*
同步es的可识别标识
 */
var syncEs=(pId,callback)=>{
    console.log("将要同步ES的pId:"+pId);
    async.waterfall([
        (next)=>{
            dbFeimu.query('select mr_id from fm_project where p_id=? and p_delete_flag=1',[pId],(error,rows,fields)=>{
                if(error){
                    next(error,null);
                }
                if(!rows||rows.length==0){
                    next(new Error("根据pId:"+pId+"没有找到片源"),null);
                }
                else if(!rows[0].mr_id||rows[0].mr_id==0){
                    next(new Error("根据pId:"+pId+"没有找到影视剧"),null);
                }else {
                    next(null,rows[0].mr_id);
                }
            })
        },(mrId,next)=>{
            //查找该片源下的所有剧集是否存在识别的
            dbFeimu.query('SELECT IF(count(*)>0,1,2) distinguish FROM fm_project_episode WHERE p_id=? AND pe_status=1 AND pe_delete_flag=1',[pId],(error,rows,fields)=>{
                if(error){
                    next(error,null);
                }else {
                    //可识别标识，1标识可以识别，2标识不可识别，默认不可识别
                    var distinguish=2;
                    if(rows&&rows.length>0){
                        distinguish=rows[0]['distinguish'];
                    }
                    console.log("pID:"+pId+"可识别状态："+distinguish);
                    var body={
                        script:'ctx._source.distinguish='+distinguish,
                        upsert:{
                            distinguish:2
                        }
                    };
                    //es文档部分更新 https://www.elastic.co/guide/cn/elasticsearch/guide/current/partial-updates.html
                    es.update(mrId,'movie_resources',body,next)
                }
            })
        }
    ],(error,result)=>{
        if(error){
            console.error("更新es错误:"+error.message);
        }
        //错误无需处理
        callback(null);
    })
}

// module.exports.syncOldData=()=>{
//     db.query('select p_id from mv_origin where p_id is not null',null,function (error,rows,fields) {
//         var ids=rows.map(item=>item.p_id);
//         async.mapLimit(ids,1,syncEs,function (err,results) {
//         })
//     })
// }
// module.exports.testUpdateEs=()=>{
//     async.mapLimit([],1,syncEs,function (err,results) {
//         console.log(err);
//         console.log(JSON.stringify(result));
//     })
// }


module.exports.syncCut = (originItem,callback)=>{
    var pId = originItem.p_id;
    var peId = originItem.pe_id;
    async.waterfall([
        (next)=>{
            //查询飞幕数据库中剧集的切片状态
            dbFeimu.query('select pe_audio_status ,pe_cut_status,pe_status from fm_project_episode where pe_id=? and pe_delete_flag=1',[peId],next)
        },
        (rows,fields,next)=>{
        if(rows&&rows.length>0){
            //如果已经同步好了切片，则不再同步
            if(rows[0].pe_cut_status==1){
                next(null,[],null);
            }else {
                //剧集数据存在，并且未同步过切片数据，则查询切片库中该片源的所有片段，进行同步
                db.query('select * from mv_cut where file_origin_title=?',[originItem.file_title],next);
            }
        }else {
            //不存在剧集数据，则不同步切片数据
            next(null,[],null);
        }
    },(rows,fields,next)=>{
        if(rows&&rows.length>0){
            idProvider.getIds(rows.length,(error,thirdIds)=>{
                if(!thirdIds||thirdIds.length==0){
                    console.error('获取主键失败');
                    throw error;
                }
                if(thirdIds.length!=rows.length){
                    console.error('主键的数量不对');
                    throw error;
                }
                next(error,thirdIds,rows);
            });
        }else {
            next(null,[],[]);
        }
    },(thirdIds,rows,next)=>{
        if(rows&&rows.length>0){
            var datas=[];
            for(var i=0;i<rows.length;i++){
                var data=convertCut(rows[i],thirdIds[i]);
                data.p_id=pId;
                data.pe_id=peId;
                datas.push(data);
            }
            if(datas.length==0){
                console.error('转化失败');
                throw new Error('转化失败');
            }
            //同步到feimu库
            doSyncCut(datas,pId,peId,next)
        }else {
            next(null,rows);
        }
    }],function (error,results) {
        if(error){
            var newOrigin={};
            newOrigin.id=originItem.id;
            newOrigin.sync_cut_status = -1;
            newOrigin.sync_at=new Date().zoneDate();
            db.updateTable('mv_origin','id',[newOrigin],function (err,result) {})
            callback(error,null);
        }else {
            var item={};
            item.id=originItem.id;
            item.sync_cut_status=1;
            item.sync_cut_at=new Date().zoneDate();
            db.updateTable('mv_origin','id',[item],function (err,result) {});
            callback(null,results);
        }
    })
}


var doSyncCut=function (datas,pId,peId,callback) {
    var poolfeimu=dbFeimu.pool();

    poolfeimu.getConnection(function (err,con) {
        if(err){
            console.log("获取连接失败");
            throw err;
        }
        con.beginTransaction(function (err) {
            if (err) {
                console.log("开启事物失败");
                con.release();
                throw err;
            }
            async.waterfall([
                (next)=>{
                    async.map(datas,(item,callback)=>{
                        con.query('insert into fm_episode_part set ?',item,function (error,result) {
                            callback(error,result);
                        });
                    },next);
                },(result,next)=>{
                    con.query('select pe_audio_status ,pe_cut_status,pe_status from fm_project_episode where pe_id=? and pe_delete_flag=1',[peId],next);
                },(rows,fields,next)=>{
                    if(rows[0].pe_audio_status==1){
                        //更新pe_cut_status和pe_status
                        con.query('update fm_project_episode set pe_cut_status=1,pe_status=1 where pe_id=?',[peId],next);
                    }else {
                        //仅仅更新pe_cut_status
                        con.query('update fm_project_episode set pe_cut_status=1 where pe_id=?',[peId],next);
                    }
                },(rows,fields,next)=>{
                    syncEs(pId,next);
                }
            ],function(error,result){
                if (error) {
                    console.log(error);
                    con.rollback(function () {
                        con.release();
                        callback(error);
                    })
                } else {
                    con.commit(function (error1) {
                        if (error1) {
                            return con.rollback(function() {
                                con.release();
                                callback(error1);
                            });
                        }
                        con.release();
                        console.log('result:' + JSON.stringify(result));
                        callback(null,result);
                    })
                }
            })
        })
    })
}

var convertCut=(cutOld,thirdId)=>{
    var data={};
    data.ep_video_url=cutOld.qiniu_key;

    var cutOptions= JSON.parse(cutOld.cut_options);
    var startTime = cutOptions.startTime;
    var duration = cutOptions.duration;
    var endTime = startTime + duration;

    data.ep_id=thirdId;
    data.ep_start_at=startTime;
    data.ep_end_at=endTime;
    data.ep_duration_time=duration;
    data.ep_status='B';
    data.ep_comments='';
    data.ep_create_time= moment(new Date().zoneDate()).format('YYYY-MM-DD HH:mm:ss');
    data.ep_update_time= data.ep_create_time;
    data.ep_delete_flag=1;

    return data;
}

var getInsertCutSql=(datas)=>{
    var sql="insert into fm_episode_part (ep_id,p_id,pe_id,ep_video_url,ep_start_at,ep_end_at,ep_duration_time,ep_status,ep_comments,ep_create_time,ep_update_time,ep_delete_flag) values ";
    var values='';
    for(var j=0;j<datas.length;j++) {
        var data = datas[j];
        var value = '(';
        value += data.ep_id + ",";
        value += data.p_id + ",";
        value += data.pe_id + ",";

        if(data.ep_video_url){
            value += data.ep_video_url + ",";
        }else {
            value += "'',"
        }
        if(data.ep_start_at){
            value += data.ep_start_at + ",";
        }else {
            value += "0,";
        }

        if(data.ep_end_at){
            value += data.ep_end_at + ",";
        }else {
            value +=  "0,";
        }

        if(data.ep_duration_time){
            value += data.ep_duration_time + ",";
        }else {
            value += '0,';
        }

        value += "'" +data.ep_status + "',";
        value += "'" + data.ep_comments + "',";
        value += "'" + moment(data.ep_create_time).format('YYYY-MM-DD HH:mm:ss') + "',";
        value += "'" + moment(data.ep_update_time).format('YYYY-MM-DD HH:mm:ss') + "',";
        value += data.ep_delete_flag;
        value += '),';

        values += value;
    }
    values = values.substring(0,values.length-1);
    console.log("values:"+values);
    return values;
}
