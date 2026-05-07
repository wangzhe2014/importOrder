import React, { useState, useEffect } from 'react';
import { Plus, Save, Trash2, Check } from 'lucide-react';
import { ShipmentData, ColumnMapping, FIELD_DISPLAY_NAMES } from '@/types';
import { getStoredTemplates, storeTemplate, deleteTemplate } from '@/utils/templateMatcher';

interface TemplateSelectorProps {
  headers: string[];
  currentMappings: { [key: string]: string };
  onMappingsChange: (mappings: { [key: string]: string }) => void;
  templateName: string;
  onTemplateNameChange: (name: string) => void;
}

export function TemplateSelector({
  headers,
  currentMappings,
  onMappingsChange,
  templateName,
  onTemplateNameChange,
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<ColumnMapping[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  useEffect(() => {
    setTemplates(getStoredTemplates());
  }, []);

  const handleTemplateSelect = (template: ColumnMapping) => {
    onMappingsChange({ ...template.mappings });
    onTemplateNameChange(template.templateName);
  };

  const handleMappingChange = (targetField: keyof ShipmentData, sourceHeader: string) => {
    const newMappings = { ...currentMappings, [targetField]: sourceHeader };
    onMappingsChange(newMappings);
  };

  const handleSaveTemplate = () => {
    if (newTemplateName.trim()) {
      storeTemplate(newTemplateName.trim(), currentMappings);
      setTemplates(getStoredTemplates());
      onTemplateNameChange(newTemplateName.trim());
      setShowSaveModal(false);
      setNewTemplateName('');
    }
  };

  const handleDeleteTemplate = (name: string) => {
    deleteTemplate(name);
    setTemplates(getStoredTemplates());
    if (templateName === name) {
      onTemplateNameChange('');
    }
  };

  const fieldKeys = Object.keys(FIELD_DISPLAY_NAMES) as (keyof ShipmentData)[];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-800">列映射配置</h3>
        <div className="flex items-center gap-2">
          <select
            value={templateName}
            onChange={(e) => {
              const selectedTemplate = templates.find((t) => t.templateName === e.target.value);
              if (selectedTemplate) {
                handleTemplateSelect(selectedTemplate);
              } else {
                onTemplateNameChange('');
              }
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">选择模板</option>
            {templates.map((template) => (
              <option key={template.templateName} value={template.templateName}>
                {template.templateName}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-1 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            保存模板
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {fieldKeys.map((field) => (
          <div key={field} className="flex items-center gap-4">
            <div className="w-32 flex-shrink-0">
              <label className="text-sm font-medium text-gray-700">
                {FIELD_DISPLAY_NAMES[field]}
              </label>
            </div>
            <div className="flex-1">
              <select
                value={currentMappings[field] || ''}
                onChange={(e) => handleMappingChange(field, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">请选择对应列</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
            {currentMappings[field] && (
              <Check className="w-5 h-5 text-green-500" />
            )}
          </div>
        ))}
      </div>

      {templates.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">已保存模板</h4>
          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <div
                key={template.templateName}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                  ${templateName === template.templateName 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-gray-100 text-gray-700'
                  }
                `}
              >
                <span>{template.templateName}</span>
                <button
                  onClick={() => handleDeleteTemplate(template.templateName)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">保存模板</h3>
            <input
              type="text"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="输入模板名称"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!newTemplateName.trim()}
                className="flex items-center gap-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
              >
                <Save className="w-4 h-4" />
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
