import React, { useState, useCallback } from 'react';
import { Upload, FileText, Truck, ArrowLeft, Wand2 } from 'lucide-react';
import { FileUploader } from '@/components/FileUploader';
import { TemplateSelector } from '@/components/TemplateSelector';
import { DataPreview } from '@/components/DataPreview';
import { ShipmentList } from '@/components/ShipmentList';
import { ProgressModal } from '@/components/ProgressModal';
import { ResultModal } from '@/components/ResultModal';
import { parseExcel, ParsedSheet } from '@/utils/excelParser';
import { findBestTemplate, mapData } from '@/utils/templateMatcher';
import { validateAll, hasErrors } from '@/utils/validator';
import { createShipments } from '@/api/shipments';
import { PreviewRow, ShipmentData } from '@/types';

type Step = 'upload' | 'mapping' | 'preview' | 'submit';

function App() {
  const [step, setStep] = useState<Step>('upload');
  const [activeTab, setActiveTab] = useState<'import' | 'list'>('import');
  const [file, setFile] = useState<File | null>(null);
  const [parsedSheets, setParsedSheets] = useState<ParsedSheet[]>([]);
  const [currentMappings, setCurrentMappings] = useState<{ [key: string]: string }>({});
  const [templateName, setTemplateName] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [showProgress, setShowProgress] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: number; failed: number; failedRows: number[] } | null>(null);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setUploadError('');
    
    try {
      const sheets = await parseExcel(selectedFile);
      
      if (sheets.length === 0) {
        setUploadError('文件中没有找到有效的工作表');
        return;
      }
      
      setParsedSheets(sheets);
      
      const firstSheet = sheets[0];
      const templateMatch = findBestTemplate(firstSheet.headers);
      setCurrentMappings(templateMatch.mappings);
      setTemplateName(templateMatch.templateName);
      
      setStep('mapping');
    } catch (error) {
      setUploadError((error as Error).message);
    }
  }, []);

  const handleMappingsChange = useCallback((mappings: { [key: string]: string }) => {
    setCurrentMappings(mappings);
  }, []);

  const handleNextToPreview = useCallback(() => {
    if (parsedSheets.length === 0) return;
    
    const firstSheet = parsedSheets[0];
    const mappedData = mapData(firstSheet.rows, currentMappings);
    const validatedRows = validateAll(mappedData);
    
    setPreviewRows(validatedRows);
    setStep('preview');
  }, [parsedSheets, currentMappings]);

  const handleRowsChange = useCallback((rows: PreviewRow[]) => {
    setPreviewRows(rows);
  }, []);

  const handleSubmit = useCallback(async () => {
    const validRows = previewRows.filter((row) => row.errors.length === 0 && !row.isDuplicate);
    
    if (validRows.length === 0) return;
    
    setShowProgress(true);
    setUploadProgress({ current: 0, total: validRows.length });
    
    try {
      const result = await createShipments(validRows as ShipmentData[]);
      setSubmitResult(result);
    } catch (error) {
      setSubmitResult({ success: 0, failed: validRows.length, failedRows: [] });
    } finally {
      setShowProgress(false);
    }
  }, [previewRows]);

  const handleResultClose = useCallback(() => {
    setSubmitResult(null);
    setStep('upload');
    setFile(null);
    setParsedSheets([]);
    setCurrentMappings({});
    setPreviewRows([]);
  }, []);

  const handleRetry = useCallback(() => {
    if (submitResult?.failedRows.length) {
      const failedIndices = new Set(submitResult.failedRows);
      const failedRows = previewRows.filter((_, index) => failedIndices.has(index));
      setPreviewRows(failedRows);
    }
    setSubmitResult(null);
  }, [submitResult, previewRows]);

  const handleBack = useCallback(() => {
    if (step === 'mapping') {
      setStep('upload');
    } else if (step === 'preview') {
      setStep('mapping');
    }
  }, [step]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <Truck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">物流批量下单系统</h1>
                <p className="text-xs text-gray-500">支持多种Excel模板自动识别</p>
              </div>
            </div>
            
            <nav className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => {
                  setActiveTab('import');
                  setStep('upload');
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'import'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <Upload className="w-4 h-4" />
                导入运单
              </button>
              <button
                onClick={() => setActiveTab('list')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'list'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                运单列表
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'list' ? (
          <ShipmentList />
        ) : (
          <div className="space-y-6">
            {step === 'upload' && (
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    1
                  </div>
                  <h2 className="text-lg font-semibold text-gray-800">上传Excel文件</h2>
                </div>
                <FileUploader
                  onFileSelect={handleFileSelect}
                  loading={false}
                  error={uploadError}
                />
              </div>
            )}

            {step === 'mapping' && (
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    返回
                  </button>
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    2
                  </div>
                  <h2 className="text-lg font-semibold text-gray-800">配置列映射</h2>
                  <Wand2 className="w-5 h-5 text-blue-500" />
                  {templateName && (
                    <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
                      {templateName}
                    </span>
                  )}
                </div>
                
                <TemplateSelector
                  headers={parsedSheets[0]?.headers || []}
                  currentMappings={currentMappings}
                  onMappingsChange={handleMappingsChange}
                  templateName={templateName}
                  onTemplateNameChange={setTemplateName}
                />
                
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleNextToPreview}
                    className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    下一步：预览数据
                  </button>
                </div>
              </div>
            )}

            {step === 'preview' && (
              <DataPreview
                rows={previewRows}
                onRowsChange={handleRowsChange}
                onSubmit={handleSubmit}
                hasErrors={hasErrors(previewRows)}
              />
            )}
          </div>
        )}
      </main>

      {showProgress && (
        <ProgressModal
          progress={uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}
          current={uploadProgress.current}
          total={uploadProgress.total}
          message="正在提交运单..."
        />
      )}

      {submitResult && (
        <ResultModal
          result={submitResult}
          onClose={handleResultClose}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}

export default App;
