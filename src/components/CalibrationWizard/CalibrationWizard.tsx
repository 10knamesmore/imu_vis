import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Button,
  Steps,
  Typography,
  Space,
  Progress,
  Alert,
  Descriptions,
  Statistic,
  Row,
  Col,
  Card,
  message,
} from 'antd';
import { Channel } from '@tauri-apps/api/core';
import { imuApi } from '../../services/imu';
import { useBluetooth } from '../../hooks/useBluetooth';
import type { ResponseData, Vector3 } from '../../types';

const { Title, Text, Paragraph } = Typography;

const G = 9.80665;

// 六个采集位置定义
type StepId = 'x_pos' | 'x_neg' | 'y_pos' | 'y_neg' | 'z_pos' | 'z_neg';

interface StepDef {
  id: StepId;
  label: string;
  hint: string;
  axis: 'x' | 'y' | 'z';
  sign: 1 | -1;
}

const STEPS: StepDef[] = [
  { id: 'x_pos', label: 'X+ 轴朝上', hint: '将设备右侧面朝上水平放置', axis: 'x', sign: 1 },
  { id: 'x_neg', label: 'X- 轴朝上', hint: '将设备左侧面朝上水平放置', axis: 'x', sign: -1 },
  { id: 'y_pos', label: 'Y+ 轴朝上', hint: '将设备前侧面朝上水平放置', axis: 'y', sign: 1 },
  { id: 'y_neg', label: 'Y- 轴朝上', hint: '将设备后侧面朝上水平放置', axis: 'y', sign: -1 },
  { id: 'z_pos', label: 'Z+ 轴朝上', hint: '将设备正面（显示面）朝上水平放置', axis: 'z', sign: 1 },
  { id: 'z_neg', label: 'Z- 轴朝上', hint: '将设备底面朝上水平放置', axis: 'z', sign: -1 },
];

type StepMean = Vector3;

type CollectionPhase = 'idle' | 'countdown' | 'collecting' | 'done';

const COLLECT_DURATION_MS = 3000;
const COUNTDOWN_DURATION_MS = 2000;

interface Props {
  deviceAddress: string;
}

export const CalibrationWizard = ({ deviceAddress }: Props) => {
  const { setNeedsCalibration, getPipelineConfig, updatePipelineConfig } =
    useBluetooth();

  // 当前步骤索引（0-5 为采集步骤，6 为结果页）
  const [stepIndex, setStepIndex] = useState(0);
  // 各位置采集均值
  const [means, setMeans] = useState<Partial<Record<StepId, StepMean>>>({});
  // 当前实时 accel_with_g 显示值
  const [liveAccel, setLiveAccel] = useState<Vector3 | null>(null);
  // 采集阶段
  const [phase, setPhase] = useState<CollectionPhase>('idle');
  // 倒计时/进度（0-100）
  const [progress, setProgress] = useState(0);
  // 保存中
  const [saving, setSaving] = useState(false);

  // 内部采样缓冲
  const samplesRef = useRef<Vector3[]>([]);
  const phaseStartRef = useRef<number>(0);
  const phaseRef = useRef<CollectionPhase>('idle');
  phaseRef.current = phase;

  // 标定向导期间直接订阅实时输出，避免额外全局订阅造成双重消息分发开销。
  useEffect(() => {
    const channel = new Channel<ResponseData>();
    channel.onmessage = (data: ResponseData) => {
      const v = data.accel_with_g;
      setLiveAccel({ x: v.x, y: v.y, z: v.z });
      if (phaseRef.current === 'collecting') {
        samplesRef.current.push({ x: v.x, y: v.y, z: v.z });
      }
    };
    imuApi.subscribeOutput(channel);

    return () => {
      channel.onmessage = () => {};
    };
  }, []);

  const currentStep = STEPS[stepIndex];

  // 开始采集（含倒计时）
  const startCollection = useCallback(() => {
    samplesRef.current = [];
    setProgress(0);
    setPhase('countdown');
    phaseStartRef.current = Date.now();

    const countdownTimer = setInterval(() => {
      const elapsed = Date.now() - phaseStartRef.current;
      const pct = Math.min((elapsed / COUNTDOWN_DURATION_MS) * 100, 100);
      setProgress(pct);
      if (elapsed >= COUNTDOWN_DURATION_MS) {
        clearInterval(countdownTimer);
        // 进入采集阶段
        samplesRef.current = [];
        phaseStartRef.current = Date.now();
        setPhase('collecting');
        setProgress(0);

        const collectTimer = setInterval(() => {
          const elapsed2 = Date.now() - phaseStartRef.current;
          const pct2 = Math.min((elapsed2 / COLLECT_DURATION_MS) * 100, 100);
          setProgress(pct2);
          if (elapsed2 >= COLLECT_DURATION_MS) {
            clearInterval(collectTimer);
            // 计算均值
            const buf = samplesRef.current;
            if (buf.length > 0) {
              const mean: Vector3 = {
                x: buf.reduce((s, v) => s + v.x, 0) / buf.length,
                y: buf.reduce((s, v) => s + v.y, 0) / buf.length,
                z: buf.reduce((s, v) => s + v.z, 0) / buf.length,
              };
              setMeans((prev) => ({ ...prev, [currentStep.id]: mean }));
            }
            setPhase('done');
            setProgress(100);
          }
        }, 50);
      }
    }, 50);
  }, [currentStep]);

  const handleNext = useCallback(() => {
    setPhase('idle');
    setProgress(0);
    setStepIndex((i) => i + 1);
  }, []);

  const handleRetry = useCallback(() => {
    setPhase('idle');
    setProgress(0);
  }, []);

  // 计算标定结果
  const computeCalibration = useCallback(() => {
    const allSteps: StepId[] = ['x_pos', 'x_neg', 'y_pos', 'y_neg', 'z_pos', 'z_neg'];
    for (const id of allSteps) {
      if (!means[id]) return null;
    }

    const xPos = means['x_pos']!;
    const xNeg = means['x_neg']!;
    const yPos = means['y_pos']!;
    const yNeg = means['y_neg']!;
    const zPos = means['z_pos']!;
    const zNeg = means['z_neg']!;

    // 偏置：b_i = (a_i⁺ + a_i⁻) / 2（各轴平均）
    // 对每个轴，取朝上时该轴方向的读数均值
    const bias = {
      x: (xPos.x + xNeg.x) / 2,
      y: (yPos.y + yNeg.y) / 2,
      z: (zPos.z + zNeg.z) / 2,
    };

    // 比例因子：s_i = 2g / (a_i⁺ - a_i⁻)
    const scale = {
      x: (2 * G) / (xPos.x - xNeg.x),
      y: (2 * G) / (yPos.y - yNeg.y),
      z: (2 * G) / (zPos.z - zNeg.z),
    };

    // 计算质量误差：对 6 个位置的校正后向量，计算 max |‖a_cal‖ - g|
    const calibrate = (v: Vector3) => ({
      x: scale.x * (v.x - bias.x),
      y: scale.y * (v.y - bias.y),
      z: scale.z * (v.z - bias.z),
    });

    const positions = [xPos, xNeg, yPos, yNeg, zPos, zNeg];
    let maxError = 0;
    for (const pos of positions) {
      const cal = calibrate(pos);
      const norm = Math.sqrt(cal.x ** 2 + cal.y ** 2 + cal.z ** 2);
      const err = Math.abs(norm - G);
      if (err > maxError) maxError = err;
    }

    return {
      bias: [bias.x, bias.y, bias.z] as [number, number, number],
      scale: [scale.x, scale.y, scale.z] as [number, number, number],
      qualityError: maxError,
    };
  }, [means]);

  const result = stepIndex === STEPS.length ? computeCalibration() : null;

  // 完成标定：应用 + 持久化
  const handleFinish = useCallback(async () => {
    if (!result) return;
    setSaving(true);
    try {
      // 1. 应用到 pipeline
      const config = await getPipelineConfig();
      if (config) {
        const updated = await updatePipelineConfig({
          ...config,
          calibration: {
            ...config.calibration,
            accel_bias: { x: result.bias[0], y: result.bias[1], z: result.bias[2] },
            accel_matrix: [
              [result.scale[0], 0, 0],
              [0, result.scale[1], 0],
              [0, 0, result.scale[2]],
            ],
          },
        });
        if (!updated) {
          throw new Error('应用标定到流水线失败');
        }
      }
      // 2. 持久化：仅使用稳定 key(address)。
      const calibrationKey = (deviceAddress || '').trim();
      if (!calibrationKey) {
        throw new Error('设备地址为空，无法保存标定');
      }
      const savePrimary = await imuApi.saveDeviceCalibration(calibrationKey, result.bias, result.scale, result.qualityError);
      if (!savePrimary.success) {
        throw new Error(savePrimary.message || `保存标定失败，key=${calibrationKey}`);
      }

      message.success('标定结果已保存并应用');
      setNeedsCalibration(false);
    } catch (e) {
      console.error('保存标定结果失败:', e);
      message.error(`保存标定结果失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setSaving(false);
    }
  }, [result, deviceAddress, getPipelineConfig, updatePipelineConfig, setNeedsCalibration]);

  // 跳过
  const handleSkip = useCallback(() => {
    setNeedsCalibration(false);
  }, [setNeedsCalibration]);

  const stepItems = STEPS.map((s, i) => ({
    title: s.label,
    status:
      i < stepIndex
        ? ('finish' as const)
        : i === stepIndex
          ? ('process' as const)
          : ('wait' as const),
  }));

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        boxSizing: 'border-box',
        background: '#0a0a0a',
        overflow: 'auto',
      }}
    >
      <Card style={{ width: '100%', maxWidth: 800 }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
          加速度计六位置标定
        </Title>
        <Paragraph
          type="secondary"
          style={{ textAlign: 'center', marginBottom: 24 }}
        >
          将设备依次放置在六个方向，采集数据以校准加速度计偏置和比例因子。
        </Paragraph>

        <Steps
          current={Math.min(stepIndex, STEPS.length - 1)}
          items={stepItems}
          size="small"
          style={{ marginBottom: 32 }}
        />

        {stepIndex < STEPS.length ? (
          <CollectionStep
            step={currentStep}
            liveAccel={liveAccel}
            phase={phase}
            progress={progress}
            stepMean={means[currentStep.id]}
            onStart={startCollection}
            onNext={handleNext}
            onRetry={handleRetry}
          />
        ) : (
          <ResultStep
            result={result}
            saving={saving}
            onFinish={handleFinish}
          />
        )}

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button danger type="link" onClick={handleSkip}>
            跳过标定（不推荐）
          </Button>
        </div>
      </Card>
    </div>
  );
};

// 采集步骤子组件

interface CollectionStepProps {
  step: StepDef;
  liveAccel: Vector3 | null;
  phase: CollectionPhase;
  progress: number;
  stepMean: StepMean | undefined;
  onStart: () => void;
  onNext: () => void;
  onRetry: () => void;
}

const CollectionStep = ({
  step,
  liveAccel,
  phase,
  progress,
  stepMean,
  onStart,
  onNext,
  onRetry,
}: CollectionStepProps) => {
  const phaseLabel =
    phase === 'idle'
      ? '等待开始'
      : phase === 'countdown'
        ? '保持静止，准备采集…'
        : phase === 'collecting'
          ? '正在采集数据…'
          : '采集完成';

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      <Alert
        title={step.label}
        description={step.hint}
        type="info"
        showIcon
      />

      <Row gutter={16}>
        <Col span={8}>
          <Statistic
            title="加速度 X（m/s²）"
            value={liveAccel?.x.toFixed(4) ?? '—'}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="加速度 Y（m/s²）"
            value={liveAccel?.y.toFixed(4) ?? '—'}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="加速度 Z（m/s²）"
            value={liveAccel?.z.toFixed(4) ?? '—'}
          />
        </Col>
      </Row>

      <div>
        <Text type="secondary">{phaseLabel}</Text>
        <Progress
          percent={Math.round(progress)}
          status={
            phase === 'countdown'
              ? 'normal'
              : phase === 'collecting'
                ? 'active'
                : phase === 'done'
                  ? 'success'
                  : 'normal'
          }
          style={{ marginTop: 8 }}
        />
      </div>

      {phase === 'done' && stepMean && (
        <Descriptions size="small" bordered>
          <Descriptions.Item label="均值 X">{stepMean.x.toFixed(5)}</Descriptions.Item>
          <Descriptions.Item label="均值 Y">{stepMean.y.toFixed(5)}</Descriptions.Item>
          <Descriptions.Item label="均值 Z">{stepMean.z.toFixed(5)}</Descriptions.Item>
        </Descriptions>
      )}

      <div style={{ textAlign: 'center' }}>
        {phase === 'idle' && (
          <Button type="primary" size="large" onClick={onStart}>
            开始采集
          </Button>
        )}
        {(phase === 'countdown' || phase === 'collecting') && (
          <Button size="large" disabled>
            采集中…
          </Button>
        )}
        {phase === 'done' && (
          <Space>
            <Button onClick={onRetry}>重新采集</Button>
            <Button type="primary" onClick={onNext}>
              下一步
            </Button>
          </Space>
        )}
      </div>
    </Space>
  );
};

// 结果步骤子组件

interface CalibrationResult {
  bias: [number, number, number];
  scale: [number, number, number];
  qualityError: number;
}

interface ResultStepProps {
  result: CalibrationResult | null;
  saving: boolean;
  onFinish: () => void;
}

const ResultStep = ({ result, saving, onFinish }: ResultStepProps) => {
  if (!result) {
    return <Alert title="标定数据不完整，请重试" type="error" />;
  }

  const qualityGood = result.qualityError < 0.05;

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      <Alert
        title={qualityGood ? '标定质量良好' : '标定质量较差，建议重新标定'}
        description={`最大误差：${result.qualityError.toFixed(5)} m/s²（建议 < 0.05）`}
        type={qualityGood ? 'success' : 'warning'}
        showIcon
      />

      <Row gutter={16}>
        <Col span={12}>
          <Descriptions title="加速度计偏置（m/s²）" size="small" bordered>
            <Descriptions.Item label="X">{result.bias[0].toFixed(5)}</Descriptions.Item>
            <Descriptions.Item label="Y">{result.bias[1].toFixed(5)}</Descriptions.Item>
            <Descriptions.Item label="Z">{result.bias[2].toFixed(5)}</Descriptions.Item>
          </Descriptions>
        </Col>
        <Col span={12}>
          <Descriptions title="加速度计比例因子" size="small" bordered>
            <Descriptions.Item label="X">{result.scale[0].toFixed(5)}</Descriptions.Item>
            <Descriptions.Item label="Y">{result.scale[1].toFixed(5)}</Descriptions.Item>
            <Descriptions.Item label="Z">{result.scale[2].toFixed(5)}</Descriptions.Item>
          </Descriptions>
        </Col>
      </Row>

      <div style={{ textAlign: 'center' }}>
        <Button
          type="primary"
          size="large"
          loading={saving}
          onClick={onFinish}
        >
          完成标定并应用
        </Button>
      </div>
    </Space>
  );
};
