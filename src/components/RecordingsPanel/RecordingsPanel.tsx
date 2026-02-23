import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, Space, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { useBluetooth } from '../../hooks/useBluetooth';
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
  } = useBluetooth();

  const [edits, setEdits] = useState<Record<number, EditState>>({});

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
        render: (value: number) => formatTimestamp(value),
      },
      {
        title: '时长',
        key: 'duration',
        render: (_, record) => formatDuration(record.started_at_ms, record.stopped_at_ms),
      },
      {
        title: '样本数',
        dataIndex: 'sample_count',
        key: 'sample_count',
      },
      {
        title: '名称',
        key: 'name',
        render: (_, record) => (
          <Input
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
        render: (_, record) => (
          <Select
            mode="tags"
            style={{ minWidth: 160 }}
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
        render: (_, record) => (
          <Space>
            <Button
              type="primary"
              onClick={() => loadRecording(record.id)}
            >
              回放
            </Button>
            <Button
              onClick={() => {
                const edit = edits[record.id];
                updateRecordingMeta(record.id, edit?.name || undefined, edit?.tags || []);
              }}
            >
              保存
            </Button>
          </Space>
        ),
      },
    ],
    [edits, loadRecording, updateRecordingMeta],
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
        scroll={{ y: 240 }} />
    </div>
  );
};
