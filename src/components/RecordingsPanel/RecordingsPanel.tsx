import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, message, Popconfirm, Select, Space, Table, Tooltip } from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { revealItemInDir } from '@tauri-apps/plugin-opener';

import { useBluetooth } from '../../hooks/useBluetooth';
import { imuApi } from '../../services/imu';
import { RecordingMeta } from '../../types';

import styles from "./RecordingsPanel.module.scss";

type EditState = {
  name: string;
  tags: string[];
};

const formatTimestamp = (ts: number) => new Date(ts).toLocaleString();

const formatDuration = (start: number, end?: number | null) => {
  if (!end) return '-';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  return `${seconds}s`;
};

export const RecordingsPanel = () => {
  const {
    recordings,
    refreshRecordings,
    updateRecordingMeta,
    loadRecording,
    replaying,
    exitReplay,
    deleteRecording,
    recordingStatus,
  } = useBluetooth();

  const [edits, setEdits] = useState<Record<number, EditState>>({});
  const [exporting, setExporting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const handleExport = useCallback(async (sessionId: number) => {
    setExporting(sessionId);
    try {
      const resp = await imuApi.exportSessionCsv(sessionId);
      if (resp.success && resp.data) {
        message.success(
          <span>
            已导出到 <code>{resp.data}</code>
            <Button
              type="link"
              size="small"
              onClick={() => revealItemInDir(resp.data!)}
            >
              打开文件夹
            </Button>
          </span>,
          8,
        );
      } else {
        message.error(`导出失败：${resp.message ?? '未知错误'}`);
      }
    } catch (e) {
      message.error(`导出失败：${e}`);
    } finally {
      setExporting(null);
    }
  }, []);

  const handleDelete = useCallback(async (sessionId: number) => {
    setDeleting(sessionId);
    try {
      await deleteRecording(sessionId);
    } finally {
      setDeleting(null);
    }
  }, [deleteRecording]);

  useEffect(() => {
    refreshRecordings();
  }, [refreshRecordings]);

  useEffect(() => {
    const next: Record<number, EditState> = {};
    for (const item of recordings) {
      next[item.id] = {
        name: item.name ?? '',
        tags: item.tags ?? [],
      };
    }
    setEdits(next);
  }, [recordings]);

  const columns = useMemo<ColumnsType<RecordingMeta>>(
    () => [
      {
        title: '开始时间',
        dataIndex: 'started_at_ms',
        key: 'started_at_ms',
        width: 155,
        render: (value: number) => formatTimestamp(value),
      },
      {
        title: '时长',
        key: 'duration',
        width: 56,
        render: (_, record) => formatDuration(record.started_at_ms, record.stopped_at_ms),
      },
      {
        title: '样本数',
        dataIndex: 'sample_count',
        key: 'sample_count',
        width: 72,
      },
      {
        title: '名称',
        key: 'name',
        width: 150,
        render: (_, record) => (
          <Input
            size="small"
            value={edits[record.id]?.name ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setEdits((prev) => ({
                ...prev,
                [record.id]: { ...prev[record.id], name: value, tags: prev[record.id]?.tags ?? [] },
              }));
            }}
            placeholder="未命名"
          />
        ),
      },
      {
        title: '标签',
        key: 'tags',
        width: 180,
        render: (_, record) => (
          <Select
            mode="tags"
            size="small"
            style={{ width: '100%' }}
            value={edits[record.id]?.tags ?? []}
            onChange={(value) => {
              setEdits((prev) => ({
                ...prev,
                [record.id]: { ...prev[record.id], tags: value, name: prev[record.id]?.name ?? '' },
              }));
            }}
            placeholder="添加标签"
          />
        ),
      },
      {
        title: '操作',
        key: 'actions',
        width: 116,
        render: (_, record) => {
          const isActiveRecording = recordingStatus?.session_id === record.id;
          return (
            <Space size={2}>
              <Tooltip title="回放">
                <Button
                  type="text"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={() => loadRecording(record.id)}
                />
              </Tooltip>
              <Tooltip title="保存">
                <Button
                  type="text"
                  size="small"
                  icon={<SaveOutlined />}
                  onClick={() => {
                    const edit = edits[record.id];
                    updateRecordingMeta(record.id, edit?.name || undefined, edit?.tags || []);
                  }}
                />
              </Tooltip>
              <Tooltip title="导出 CSV">
                <Button
                  type="text"
                  size="small"
                  icon={<DownloadOutlined />}
                  loading={exporting === record.id}
                  onClick={() => handleExport(record.id)}
                />
              </Tooltip>
              <Popconfirm
                title="确认删除此录制？"
                description="删除后无法恢复。"
                onConfirm={() => handleDelete(record.id)}
                disabled={isActiveRecording}
              >
                <Tooltip title={isActiveRecording ? '正在录制中，无法删除' : '删除'}>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    loading={deleting === record.id}
                    disabled={isActiveRecording}
                  />
                </Tooltip>
              </Popconfirm>
            </Space>
          );
        },
      },
    ],
    [edits, exporting, deleting, loadRecording, updateRecordingMeta, handleExport, handleDelete, recordingStatus],
  );



  return (
    <div className={styles.recordingsPanel}>
      <div className={styles.recordingsHeader}>
        <Space>
          <Button onClick={refreshRecordings}>刷新</Button>
          <Tooltip title="退出回放会恢复实时数据更新">
            <Button disabled={!replaying} onClick={exitReplay}>
              退出回放
            </Button>
          </Tooltip>
        </Space>
      </div>
      <Table
        rowKey="id"
        dataSource={recordings}
        columns={columns}
        pagination={{ pageSize: 6 }}
        size="small"
        className={styles.recordingsTable}
        scroll={{ y: 240 }}
      />
    </div>
  );
};
