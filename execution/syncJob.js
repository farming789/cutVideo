var db = require('../lib/db_none_transational');
var dbFeimu=require('../lib/dbFeimu');
var idProvider=require('../lib/IdProvider');
var async = require('async');

module.exports.syncProject = (mvOriginItem,callback)=>{
    async.waterfall([(next)=>{
        //同步feimu数据库的project表  片名，作品形式 ，总集数，豆瓣链接
        dbFeimu.query('select * from fm_project where p_name=? and p_delete_flag=1',[mvOriginItem.video_name],next)
    },(rows,fields,next)=>{
        if(rows&&rows.length>0){
            next(null,rows[0].p_id)
        }else {
            //如果不存在，则新增一条片源
            insertProject(mvOriginItem,next);
        }
    },(pId,next)=>{
        //判断feimu数据库的fm_project_episode是否有该剧集
        dbFeimu.query('select * from fm_project_episode where p_id=? and pe_file_name=? and pe_delete_flag=1',[pId,mvOriginItem.file_title],function (error,rows,fields) {
            next(error,pId,rows);
        })
    },(pId,rows,next)=>{
        if(rows&&rows.length>0){
            updateProjectEpisode(mvOriginItem,rows[0],next)
        }else {
            //如果不存在则，新增片源剧集
            insertProjectEpisode(mvOriginItem,pId,next);
        }
    },(pId,peId,next)=>{
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
            db.updateTable('mv_origin','id',[newOrigin],next)
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
            dbFeimu.insertIgnoreTable('fm_project',[project],next)
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
                    episode.pe_id=id;
                    episode.p_id=pId;
                    mvOrigin.pe_id=id;
                    episode.pe_episode_name="第"+mvOrigin.sets+"集"
                    episode.pe_file_name=mvOrigin.file_title;
                    episode.pe_sets=mvOrigin.sets;
                    episode.pe_audio_status=1;
                }
            });
        },(next)=>{
            db.query('select * from mv_novideos where file_title=?',[mvOrigin.file_title],function (error,rows,fields) {
                if(error){
                    next(error,null);
                }else {
                    if(rows&&rows.length>0){
                        episode.pe_acr_id = rows[0].acr_id;
                    }
                    next();
                }
            })
        },(next)=>{
            dbFeimu.insertIgnoreTable('fm_project_episode',[episode],next);
        }
    ],function (error,result) {
        if(error){
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
                    next(error,null);
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
                //更新pe_cut_status和pe_status
                dbFeimu.query('update fm_project_episode set pe_cut_status=1,pe_status=1,pe_acr_id=?, where pe_id=?',[episode.pe_acr_id,episode.pe_id],next);
            }else {
                //仅仅更新pe_cut_status
                dbFeimu.query('update fm_project_episode set pe_cut_status=1,pe_acr_id=? where pe_id=?',[episode.pe_acr_id,episode.pe_id],next);
            }
        }
    ],function (error,result) {
        if(error){
            callback(error);
        }else {
            callback(null,episode.p_id,episode.pe_id);
        }
    })
}

module.exports.syncCut = (row,callback)=>{
    var pId = row.p_id;
    var peId = row.pe_id;
    async.waterfall([(next)=>{
        //查询切片库中该片源的所有片段
        db.query('select * from mv_cut where file_origin_title=?',[row.file_title],next);
    },(rows,fields,next)=>{
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
            doSyncCut(data,peId,next)
        }else {
            next(null,rows);
        }
    },(next)=>{
        //更新切片库的mv_origin的sync_cut_status，sync_cut_at
        var item={};
        item.id=row.id;
        item.sync_cut_status=1;
        item.sync_cut_at=new Date().zoneDate();
        db.updateTable('mv_origin','id',[item],next);
    }],function (error,results) {
        if(error){
            callback(error,null);
        }else {
            callback(null,results);
        }
    })
}

var doSyncCut=function (datas,peId,callback) {
    var poolfeimu=dbFeimu.pool();

    poolfeimu.getConnection(function (err,con) {
        if(err){
            console.log("获取连接失败");
            throw err;
        }
        console.log(con);
        con.beginTransaction(function (err) {
            if (err) {
                console.log("开启事物失败");
                throw err;
            }
            async.waterfall([
                (next)=>{
                    var sql= getInsertCutSql(datas);
                    //批量插入飞幕库的fm_episode_part表
                    con.query(sql,[],next);
                },(next1)=>{
                    con.query('select pe_audio_status ,pe_cut_status,pe_status from fm_project_episode where pe_id=?',[peId],next)
                },(rows,fields,next)=>{
                    if(rows[0].pe_audio_status==1){
                        //更新pe_cut_status和pe_status
                        con.query('update fm_project_episode set pe_cut_status=1,pe_status=1 where pe_id=?',[peId],next);
                    }else {
                        //仅仅更新pe_cut_status
                        con.query('update fm_project_episode set pe_cut_status=1 where pe_id=?',[peId],next);
                    }
                }
            ],function(error,result){
                if (error) {
                    console.log(error);
                    con.rollback(function () {
                        callback(error);
                    })
                } else {
                    con.commit(function (error1) {
                        if (error1) {
                            return con.rollback(function() {
                                callback(error1);
                            });
                        }
                        console.log('result:' + result)
                        callback(null,result);
                    })
                }
            })
        })
    })
}

var convertCut=(cutOld,thirdId)=>{
    var data={};
    data.ep_video_url=cutOld.qinIu_key;

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
    data.ep_create_time= new Date().zoneDate();
    data.ep_update_time= new Date().zoneDate();
    data.ep_delete_flag=1;

    return data;
}

var getInsertCutSql=(datas)=>{
    var sql="insert into fm_episode_part ('ep_id','p_id','pe_id','ep_video_url','ep_start_at','ep_end_at','ep_duration_time','ep_status','ep_comments','ep_create_time','ep_update_time','ep_delete_flag') values ";
    var values='';
    for(var j=0;j<datas.length;j++) {
        var data = datas[j];
        var value = '(';
        value += data.ep_id + ",";
        value += data.p_id + ",";
        value += data.pe_id + ",";
        value += data.ep_video_url + ",";
        value += data.ep_start_at + ",";
        value += data.ep_end_at + ",";
        value += data.ep_duration_time + ",";
        value += data.ep_status + ",";
        value += data.ep_comments + ",";
        value += data.ep_create_time + ",";
        value += data.ep_update_time + ",";
        value += data.ep_delete_flag;
        value += '),';

        values += value;
    }
    values = values.substring(0,values.length-1);
    console.log("values:"+values);
    return values;
}
