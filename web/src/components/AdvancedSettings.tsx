import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Repeat, RotateCcw, Trash2 } from 'lucide-react';
import type { MockRule, ResponseVariant } from '@shared/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { LazyCodeEditor as CodeEditor } from './LazyCodeEditor';
import { api } from '@/lib/api';
import { uid } from '@shared/defaults';
import { toast } from './ui/toast';

interface AdvancedSettingsProps {
  rule: MockRule;
  onChange: (patch: Partial<MockRule>) => void;
}

function newVariant(): ResponseVariant {
  return { id: uid(), label: '', statusCode: '', delayMs: '', body: '' };
}

export function AdvancedSettings({ rule, onChange }: AdvancedSettingsProps) {
  const [openVariants, setOpenVariants] = useState((rule.variants ?? []).length > 0);

  const variants = rule.variants ?? [];
  const variantsEnabled = rule.variantsEnabled !== false;

  const patchVariant = (id: string, patch: Partial<ResponseVariant>) =>
    onChange({ variants: variants.map((item) => (item.id === id ? { ...item, ...patch } : item)) });

  return (
    <div className="glass mt-4 rounded-2xl p-4">
      <p className="panel-title mb-3">高级</p>

      <div className="space-y-2">
        <div className="rounded-xl border border-line bg-fill">
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => setOpenVariants(!openVariants)}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
            >
              {openVariants && variantsEnabled ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )}
              <Repeat size={12} className="text-accent-300" />
              <span className="text-[12px] font-medium text-muted-100">响应序列</span>
              {variants.length > 0 ? (
                <span className="rounded-md bg-accent-400/20 px-1.5 text-[10.5px] text-accent-300">
                  {variants.length}
                </span>
              ) : null}
            </button>
            <span className="hidden truncate text-[11px] text-muted-300 md:inline">
              {variantsEnabled ? '按顺序循环返回，用于模拟首次成功/再次失败' : '不轮询'}
            </span>
            <Switch
              title="启用响应序列"
              checked={variantsEnabled}
              onCheckedChange={(value) => onChange({ variantsEnabled: value })}
            />
          </div>

          {variantsEnabled && openVariants ? (
            <div className="space-y-2 border-t border-line p-3">
              {variants.length === 0 ? (
                <p className="text-[11.5px] text-muted-300">
                  留空的字段沿用规则本身的配置，只覆盖填写的项。
                </p>
              ) : null}
              {variants.map((variant, index) => (
                <div key={variant.id} className="rounded-lg border border-line p-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-[34px] shrink-0 font-mono text-[11px] text-accent-300">
                      #{index + 1}
                    </span>
                    <Input
                      value={variant.label}
                      placeholder="备注（如：首次成功）"
                      className="h-7 flex-1"
                      onChange={(event) => patchVariant(variant.id, { label: event.target.value })}
                    />
                    <Input
                      value={variant.statusCode}
                      placeholder="状态码"
                      className="h-7 w-[78px] font-mono"
                      onChange={(event) =>
                        patchVariant(variant.id, { statusCode: event.target.value })
                      }
                    />
                    <Input
                      value={variant.delayMs}
                      placeholder="延迟 ms"
                      className="h-7 w-[78px] font-mono"
                      onChange={(event) =>
                        patchVariant(variant.id, { delayMs: event.target.value })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        onChange({ variants: variants.filter((item) => item.id !== variant.id) })
                      }
                    >
                      <Trash2 size={12} className="text-muted-300" />
                    </Button>
                  </div>
                  <div className="mt-1.5">
                    <CodeEditor
                      value={variant.body}
                      language={rule.responseType === 'html' ? 'html' : 'json'}
                      height="110px"
                      placeholder="覆盖响应体（留空则使用规则内容）"
                      onChange={(value) => patchVariant(variant.id, { body: value })}
                    />
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ variants: [...variants, newVariant()] })}
                >
                  <Plus size={12} /> 添加一档
                </Button>
                {variants.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      api
                        .resetVariants(rule.id)
                        .then(() => toast('序列计数已重置', 'info'))
                        .catch(() => toast('重置失败', 'error'));
                    }}
                  >
                    <RotateCcw size={12} /> 重置计数
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {variantsEnabled ? null : (
            <p className="border-t border-line px-3 py-2 text-[11.5px] text-muted-300">
              已关闭：每次请求都返回上面的响应配置，不做任何轮询。已填序列会保留，重新打开开关即恢复。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
