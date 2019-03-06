##查询某个片源的音频提取，转码，切片，切片上传时间
select a.file_title,a.novideo_status,a.resize_status,
b.novideo_start_time,b.novideo_end_time,
c.resize_start_time,c.resize_end_time,
c.cut_status,c.cut_start_time,c.cut_end_time,
(
	select MIN(upload_status) from mv_cut where file_origin_title=a.file_title
	group by file_origin_title
) upload_status,
(
	select MIN(upload_start_time) from mv_cut where file_origin_title=a.file_title
	group by file_origin_title
) upload_start_time,
(
	select MAX(upload_end_time) from mv_cut where file_origin_title=a.file_title
	group by file_origin_title
) upload_end_time
from mv_origin a
left join mv_novideos b on a.file_title=b.file_title
left join mv_resize c on a.file_title=c.file_title
where a.file_title='s2-2'


## 备份并清空mv_tmp表

CREATE TABLE mv_tmp_20180731 SELECT
	*
FROM
	mv_tmp;

TRUNCATE TABLE mv_tmp;

## 删除重复记录

DELETE
FROM
	mv_tmp
WHERE
	file_path IN(SELECT file_path FROM mv_origin);

## 导入源视频记录

	INSERT INTO mv_origin(
		file_path ,
		file_title ,
		acr_bucket_name ,
		resize
	) SELECT
		file_path ,
		file_title ,
		'd2' ,
		'360p-16x9'
	FROM
		mv_tmp ## 添加实例任务

	UPDATE mv_origin mo
	SET mo.instance_id = 5470
	WHERE
		mo.acr_bucket_name = 'd2'
	AND mo.instance_id IS NULL;

## 手动更新切片状态

UPDATE mv_resize mr
SET mr.upload_status = 10
WHERE
	mr.upload_status = 0
AND mr.cut_status = 1
AND mr.file_title IN(
	SELECT
		file_origin_title
	FROM
		(
			SELECT
				mc.file_origin_title ,
				sum(
					CASE
					WHEN mc.upload_status > 0 THEN
						0
					ELSE
						1
					END
				) AS left_upload FROM mv_cut mc GROUP BY mc.file_origin_title HAVING left_upload = 0
		) aa
)

#删除
delete from mv_cut where file_origin_title='菲利普船长';
delete from mv_novideos where file_title='菲利普船长';
delete from mv_resize where file_title='菲利普船长';
delete from mv_origin where file_title='菲利普船长';
