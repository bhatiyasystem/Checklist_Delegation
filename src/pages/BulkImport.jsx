import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, FileText, CheckCircle2, AlertCircle, ArrowLeft,
  Download, Loader2, Table, Database, Info, X, ChevronRight,
  ClipboardList, Users, ArrowRight, Layers, Layout
} from 'lucide-react';
import Papa from 'papaparse';
import AdminLayout from '../components/layout/AdminLayout';
import { useMagicToast } from '../context/MagicToastContext';
import supabase from '../SupabaseClient';
import { motion, AnimatePresence } from 'framer-motion';

const BulkImport = () => {
  const [activeModule, setActiveModule] = useState('checklist');
  const [csvData, setCsvData] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importStatus, setImportStatus] = useState({ success: 0, failed: 0, total: 0 });
  const [isImporting, setIsImporting] = useState(false);
  const [mapping, setMapping] = useState({});
  const [currentStep, setCurrentStep] = useState(1); // 1: Type, 2: Upload, 3: Map, 4: Review
  const { showToast } = useMagicToast();
  const navigate = useNavigate();
  const [holidays, setHolidays] = useState([]);
  const [workingDaySet, setWorkingDaySet] = useState(new Set());
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [showFormatModal, setShowFormatModal] = useState(false);

  const getLocalDateString = (date) => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Fetch holidays and working days on mount
  React.useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch holidays
        const { data: hData } = await supabase.from('holidays').select('holiday_date');
        if (hData) setHolidays(hData.map(h => h.holiday_date));

        // Fetch working days for a large range (next 2 years)
        const start = new Date();
        start.setMonth(start.getMonth() - 1); // Start from last month
        const end = new Date();
        end.setFullYear(end.getFullYear() + 2); // Fetch 2 years ahead

        const { data: wData } = await supabase
          .from('working_day_calender')
          .select('working_date')
          .gte('working_date', getLocalDateString(start))
          .lte('working_date', getLocalDateString(end));

        if (wData) {
          // Robustly clean dates: handle 'T', ' ', or just the date string
          const cleanedDates = wData
            .map(d => {
              const raw = d.working_date || "";
              return raw.includes('T') ? raw.split('T')[0] : raw.split(' ')[0];
            })
            .map(s => s.trim())
            .filter(Boolean);
          setWorkingDaySet(new Set(cleanedDates));
          console.log(`âœ… Loaded ${cleanedDates.length} working days from calendar.`);
        }
        setIsCalendarLoading(false);
      } catch (err) {
        console.error("Initialization error:", err);
        showToast("Failed to load calendar data. Please refresh.", "error");
        setIsCalendarLoading(false);
      }
    };
    fetchData();
  }, []);

  const freqMap = {
    "One Time (No Recurrence)": "one-time",
    "Alternate Day": "alternate-day",
    "Daily": "daily",
    "Weekly": "weekly",
    "Fortnight": "fortnight",
    "Monthly": "monthly",
    "Quarterly": "quarterly",
    "Half Yearly": "half-yearly",
    "Yearly": "yearly"
  };

  const generateDatesForTask = (taskDate, frequency) => {
    // Normalize frequency to match freqMap keys
    const normalizedFreq = frequency?.trim();
    const freqKey = freqMap[normalizedFreq] ||
      freqMap[Object.keys(freqMap).find(k => k.toLowerCase() === normalizedFreq.toLowerCase())] ||
      normalizedFreq?.toLowerCase() ||
      "one-time";

    const dates = [];
    const startDate = new Date(taskDate);
    const time = "09:00"; // Default time

    const endDate = new Date(startDate);
    if (freqKey === "one-time") {
      // No extension
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    const isHoliday = (d) => holidays.includes(getLocalDateString(d));
    const isWorkingDay = (d) => {
      if (workingDaySet.size === 0) return true; // Fallback: if calendar is empty, allow all days
      return workingDaySet.has(getLocalDateString(d));
    };
    const toLocalISO = (d) => `${getLocalDateString(d)}T${time}:00`;
    const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

    if (freqKey === "one-time") {
      if (!isHoliday(startDate) && isWorkingDay(startDate)) {
        dates.push(toLocalISO(startDate));
      }
      return dates;
    }

    if (freqKey === 'daily' || freqKey === 'alternate-day') {
      const validDays = [];
      let d = new Date(startDate);
      while (d <= endDate) {
        if (!isHoliday(d) && isWorkingDay(d)) validDays.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
      if (freqKey === 'daily') validDays.forEach(day => dates.push(toLocalISO(day)));
      else validDays.forEach((day, i) => { if (i % 2 === 0) dates.push(toLocalISO(day)); });
    } else {
      let current = new Date(startDate);
      let attempts = 0;
      while (current <= endDate && attempts < 1000) {
        attempts++;
        let target = new Date(current);
        while (target <= endDate && (isHoliday(target) || !isWorkingDay(target))) {
          target.setDate(target.getDate() + 1);
        }
        if (target <= endDate) {
          dates.push(toLocalISO(target));
        }
        if (freqKey === 'weekly') current = addDays(current, 7);
        else if (freqKey === 'fortnight') current = addDays(current, 14);
        else if (freqKey === 'monthly') current.setMonth(current.getMonth() + 1);
        else if (freqKey === 'quarterly') current.setMonth(current.getMonth() + 3);
        else if (freqKey === 'half-yearly') current.setMonth(current.getMonth() + 6);
        else if (freqKey === 'yearly') current.setFullYear(current.getFullYear() + 1);
        else break;
      }
    }
    console.log(`[Series: ${normalizedFreq}] Generated ${dates.length} occurrences from ${getLocalDateString(startDate)} to ${getLocalDateString(endDate)}`);
    return dates;
  };

  const downloadCsvTemplate = () => {
    const fields = MODULES[activeModule].fields;
    const headers = fields.map(f => f.label).join(',');
    const exampleRow = fields.map(f => {
      if (f.key === 'task_start_date') return '05/09/2026';
      if (f.key === 'frequency') return activeModule === 'delegation' ? 'One Time (No Recurrence)' : 'Daily';
      return PLACEHOLDERS[f.key] || '';
    }).join(',');
    
    const csvContent = `${headers}\n${exampleRow}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeModule}_template.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`${activeModule} template downloaded`, "success");
  };

  const PLACEHOLDERS = {
    department: "e.g. Sales / HR",
    given_by: "e.g. Manager Name",
    name: "e.g. Staff Name",
    task_description: "e.g. Daily Cleanup",
    frequency: activeModule === 'delegation' ? "e.g. One Time (No Recurrence)" : "e.g. Daily / Weekly",
    duration: "e.g. 30 Mins",
    task_start_date: "e.g. 5/9/2026",
  };

  const MODULES = {
    checklist: {
      label: 'Checklist',
      description: 'Import routine operational tasks',
      icon: ClipboardList,
      color: 'text-purple-600',
      accent: 'purple',
      bg: 'bg-purple-50',
      table: 'checklist',
      fields: [
        { key: 'department', label: 'Department', required: true },
        { key: 'given_by', label: 'Assign From', required: true },
        { key: 'name', label: 'Doer Name', required: true },
        { key: 'task_description', label: 'Description', required: true },
        { key: 'frequency', label: 'Frequency', required: true },
        { key: 'duration', label: 'Duration', required: false },
        { key: 'task_start_date', label: 'Start Date', required: true },
      ]
    },
    delegation: {
      label: 'Delegation',
      description: 'Import assigned delegation tasks',
      icon: Users,
      color: 'text-indigo-600',
      accent: 'indigo',
      bg: 'bg-indigo-50',
      table: 'delegation',
      fields: [
        { key: 'department', label: 'Department', required: true },
        { key: 'given_by', label: 'Assign From', required: true },
        { key: 'name', label: 'Assignee Name', required: true },
        { key: 'task_description', label: 'Description', required: true },
        { key: 'task_start_date', label: 'Start Date', required: true },
        { key: 'frequency', label: 'Frequency', required: true },
        { key: 'duration', label: 'Duration', required: false },
      ]
    }
  };

  const updateCsvCell = (rowIndex, columnHeader, newValue) => {
    const updatedData = [...csvData];
    updatedData[rowIndex][columnHeader] = newValue;
    setCsvData(updatedData);
  };

  const steps = [
    { id: 1, label: 'Task Type' },
    { id: 2, label: 'Upload CSV' },
    { id: 3, label: 'Map Fields' },
    { id: 4, label: 'Import Data' }
  ];

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete: (results) => {
        setCsvData(results.data);
        setHeaders(results.meta.fields);

        // Strict Auto-mapping by Label
        const newMapping = {};
        const missingFields = [];
        
        MODULES[activeModule].fields.forEach(field => {
          const match = results.meta.fields.find(h => 
            h.trim().toLowerCase() === field.label.trim().toLowerCase()
          );
          if (match) {
            newMapping[field.key] = match;
          } else if (field.required) {
            missingFields.push(field.label);
          }
        });

        if (missingFields.length > 0) {
          showToast(`Invalid CSV! Missing columns: ${missingFields.join(', ')}`, "error");
          setIsProcessing(false);
          return;
        }

        setMapping(newMapping);
        
        // Duplication Check
        const seenTasks = new Set();
        const duplicateTasks = [];
        const uniqueData = results.data.filter((row, idx) => {
          const desc = row[newMapping['task_description']]?.trim().toLowerCase();
          const dept = row[newMapping['department']]?.trim().toLowerCase();
          const name = row[newMapping['name']]?.trim().toLowerCase();
          const freq = row[newMapping['frequency']]?.trim().toLowerCase();
          
          if (!desc) return true; // Let the required field check handle empty descriptions later

          // Create a composite key to check for "Same task + Same fields"
          const taskKey = `${desc}|${dept}|${name}|${freq}`;
          
          if (seenTasks.has(taskKey)) {
            duplicateTasks.push({ index: idx + 1, desc });
            return false;
          }
          
          seenTasks.add(taskKey);
          return true;
        });

        if (duplicateTasks.length > 0) {
          showToast(`Filtered ${duplicateTasks.length} duplicate tasks from CSV.`, "info");
        }

        setCsvData(uniqueData);
        setIsProcessing(false);
        setCurrentStep(3); // Jump to Preview/Review
        showToast("CSV matched and parsed successfully", "success");
      },
      error: (err) => {
        console.error(err);
        showToast("Error parsing CSV", "error");
        setIsProcessing(false);
      }
    });
  };
  const handleImport = async () => {
    if (!csvData || csvData.length === 0) return;

    if (isCalendarLoading) {
      showToast("Calendar data is still loading. Please wait a moment.", "info");
      return;
    }

    let processingData = csvData;
    // Removed the 100-row limit to allow all rows to be processed

    const missingRequired = MODULES[activeModule].fields
      .filter(f => f.required && !mapping[f.key])
      .map(f => f.label);

    if (missingRequired.length > 0) {
      showToast(`Please map required fields: ${missingRequired.join(', ')}`, "error");
      return;
    }

    setIsImporting(true);
    setImportStatus({ success: 0, failed: 0, total: 0 });
    setCurrentStep(4);

    try {
      const allPreparedData = [];
      let skippedRows = [];
      let currentRowIndex = 0;

      // Helper to parse dates from various CSV formats
      const parseCsvDate = (dateStr) => {
        if (!dateStr) return null;
        const s = dateStr.trim();

        // Strict MM/DD/YYYY parsing
        const parts = s.split(/[-./\s]/).filter(Boolean);
        if (parts.length >= 3) {
          const mm = parseInt(parts[0], 10);
          const dd = parseInt(parts[1], 10);
          const yyyy = parseInt(parts[2], 10);

          if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yyyy > 2000) {
             return new Date(yyyy, mm - 1, dd);
          }
        }

        // Fallback for native parsing
        let d = new Date(s);
        if (!isNaN(d.getTime())) return d;
        
        return null;
      };

      let seriesCounter = 0;
      // First, expand all tasks
      for (const row of processingData) {
        currentRowIndex++;
        seriesCounter++;
        const baseEntry = {};
        MODULES[activeModule].fields.forEach(field => {
          const csvHeader = mapping[field.key];
          let value = row[csvHeader] || null;
          baseEntry[field.key] = value;
        });

        // series_id is not supported in the current DB schema, skipping it.
        const seriesId = null;

        // Map schema-specific fields based on assignTaskApi.js standards
        const entry = { ...baseEntry };

        entry.department = baseEntry.department || baseEntry.shop || null;
        entry.name = baseEntry.name || null;
        entry.given_by = baseEntry.given_by || null;

        // Status logic from assignTaskApi.js
        entry.status = activeModule === 'checklist' ? null : 'pending';

        // Enum strings from assignTaskApi.js
        entry.enable_reminder = 'no';
        entry.require_attachment = 'no';
        entry.admin_done = false;

        let startDate = parseCsvDate(baseEntry.task_start_date);
        if (!startDate) {
          console.warn(`[Row ${currentRowIndex}] Invalid date found: "${baseEntry.task_start_date}". Using today as fallback.`);
          startDate = new Date(); // Use today instead of skipping the row
          skippedRows.push({ row: currentRowIndex, reason: "Date corrected to Today" });
        }

        // Generate multiple dates for the task (now synchronous and fast)
        const frequency = (baseEntry.frequency || "").trim();
        const taskDates = generateDatesForTask(startDate, frequency);

        taskDates.forEach(date => {
          const finalEntry = { ...entry };
          finalEntry.task_start_date = date;
          finalEntry.planned_date = date;
          finalEntry.created_at = new Date().toISOString();
          allPreparedData.push(finalEntry);
        });
      }

      setImportStatus(prev => ({ ...prev, total: allPreparedData.length }));

      if (allPreparedData.length === 0) {
        showToast("No tasks were generated. Check your CSV dates and frequencies.", "error");
        setIsImporting(false);
        return;
      }

      if (allPreparedData.length > 0) {
        console.log("Sample Prepared Task Data (Check series_id):", allPreparedData[0]);
      }

      const CHUNK_SIZE = 200;
      let successCount = 0;
      let failedCount = 0;
      console.log(`Starting bulk insert of ${allPreparedData.length} records in chunks of ${CHUNK_SIZE}...`);

      for (let i = 0; i < allPreparedData.length; i += CHUNK_SIZE) {
        const chunk = allPreparedData.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from(MODULES[activeModule].table).insert(chunk);

        if (error) {
          console.error(`Supabase Error (${MODULES[activeModule].table}):`, error);
          showToast(`DB Error: ${error.message || 'Check console for details'}`, "error");
          failedCount += chunk.length;
        } else {
          successCount += chunk.length;
        }
        setImportStatus(prev => ({ ...prev, success: successCount, failed: failedCount }));
      }

      const skipMsg = skippedRows.length > 0 ? ` (${skippedRows.length} rows skipped)` : "";
      if (failedCount > 0) {
        showToast(`Import complete. ${successCount} successful, ${failedCount} failed${skipMsg}.`, "warning");
      } else {
        showToast(`Success! ${successCount} tasks processed${skipMsg}.`, "success");
      }
      
      if (skippedRows.length > 0) {
        console.log("Skipped Rows Details:");
        console.table(skippedRows);
      }

      if (successCount > 0) {
        setTimeout(() => navigate('/dashboard/admin'), 3000);
      }
    } catch (err) {
      showToast("Critical error during import", "error");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <AdminLayout>
      <div className="min-h-screen bg-slate-50/50">
        <div className="max-w-6xl mx-auto p-4 sm:p-8">

          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div className="flex items-center gap-5">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate(-1)}
                className="w-12 h-12 flex items-center justify-center bg-white rounded-2xl shadow-sm border border-slate-200 text-slate-600 hover:text-purple-600 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </motion.button>
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                  Bulk <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Import</span>
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${isCalendarLoading ? 'bg-amber-50 text-amber-600 animate-pulse' : 'bg-green-50 text-green-600'}`}>
                    <Database className="w-2.5 h-2.5" />
                    {isCalendarLoading ? 'Loading Calendar...' : `Calendar Active (${workingDaySet.size} days)`}
                  </div>
                  <p className="text-slate-400 font-bold text-[10px] uppercase tracking-tighter italic opacity-60">System Ready</p>
                </div>
              </div>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
              {steps.map((step, idx) => (
                <React.Fragment key={step.id}>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${currentStep === step.id ? 'bg-purple-600 text-white shadow-md shadow-purple-200' : 'text-slate-400'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border ${currentStep === step.id ? 'border-white' : 'border-slate-200'}`}>
                      {currentStep > step.id ? <CheckCircle2 className="w-3 h-3" /> : step.id}
                    </div>
                    <span className="text-xs font-bold whitespace-nowrap">{step.label}</span>
                  </div>
                  {idx < steps.length - 1 && <ChevronRight className="w-4 h-4 text-slate-200" />}
                </React.Fragment>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {/* Step 1: Module Selection */}
            {currentStep === 1 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-6"
              >
                {Object.entries(MODULES).map(([key, mod]) => (
                  <motion.button
                    key={key}
                    whileHover={{ y: -5, shadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                    onClick={() => {
                      setActiveModule(key);
                      setCurrentStep(2);
                    }}
                    className={`
                      relative group flex flex-col p-8 rounded-[2rem] bg-white border-2 transition-all text-left overflow-hidden
                      ${activeModule === key
                        ? 'border-purple-600 shadow-xl shadow-purple-100'
                        : 'border-slate-100 hover:border-purple-200'}
                    `}
                  >
                    <div className={`w-16 h-16 rounded-2xl ${mod.bg} ${mod.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                      <mod.icon className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 mb-2">{mod.label}</h3>
                    <p className="text-slate-500 text-sm leading-relaxed mb-8">{mod.description}</p>

                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target: {mod.table}</span>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${activeModule === key ? 'bg-purple-600 text-white' : 'bg-slate-50 text-slate-300'}`}>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Decorative background element */}
                    <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full ${mod.bg} opacity-20 blur-2xl group-hover:opacity-40 transition-opacity`} />
                  </motion.button>
                ))}
              </motion.div>
            )}

            {/* Step 2: Upload */}
            {currentStep === 2 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden"
              >
                <div className="p-12 md:p-20 flex flex-col items-center justify-center text-center">
                  <div className="relative mb-10">
                    <div className="w-24 h-24 bg-purple-50 text-purple-600 rounded-[2rem] flex items-center justify-center relative z-10">
                      <Upload className="w-10 h-10 animate-bounce" />
                    </div>
                    <div className="absolute -inset-4 bg-purple-100 rounded-[2.5rem] blur-xl opacity-40 animate-pulse" />
                  </div>

                  <h2 className="text-2xl font-black text-slate-900 mb-4">Upload {MODULES[activeModule].label} Data</h2>
                  <p className="text-slate-500 max-w-md mb-10 font-medium text-center">
                    Drag and drop your CSV file here, or click to browse.
                    <span className="text-purple-600 font-bold block mt-1 underline decoration-purple-200 decoration-2 underline-offset-4">Max 100 base records allowed per import.</span>
                    <span className="text-slate-400 text-[10px] block mt-2 uppercase tracking-tighter">Extra columns will be ignored automatically.</span>
                  </p>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowFormatModal(true)}
                    className="px-10 py-5 bg-slate-900 text-white rounded-2xl font-black shadow-2xl shadow-slate-300 hover:bg-purple-600 transition-all flex items-center gap-4"
                  >
                    <Table className="w-5 h-5" />
                    CSV Format
                  </motion.button>

                  <div className="mt-12 grid grid-cols-3 gap-8 text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Database className="w-5 h-5" />
                      <span className="text-[10px] font-black uppercase">Auto-Sync</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 text-purple-500">
                      <Layers className="w-5 h-5" />
                      <span className="text-[10px] font-black uppercase tracking-tighter">Chunk Processing</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <Layout className="w-5 h-5" />
                      <span className="text-[10px] font-black uppercase">Smart Map</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-6 border-t border-slate-100 flex justify-center">
                  <button onClick={() => setCurrentStep(1)} className="text-xs font-black text-slate-400 hover:text-purple-600 transition-colors flex items-center gap-2 uppercase tracking-widest">
                    <ArrowLeft className="w-3 h-3" /> Go Back to Type
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Mapping */}
            {currentStep === 3 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col lg:flex-row gap-6"
              >
                {/* Expanded Preview Card (Mapping Removed) */}
                <div className="w-full bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col">
                  <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                      <h3 className="font-black text-slate-900 text-sm uppercase flex items-center gap-2">
                        <Table className="w-4 h-4 text-purple-600" />
                        Data Preview & Final Edit
                      </h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter mt-1">Reviewing {csvData.length} records. You can click any cell to edit.</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setCurrentStep(2)}
                        className="px-6 py-3 border-2 border-slate-200 text-slate-500 rounded-xl text-xs font-black hover:bg-slate-50 transition-all uppercase tracking-widest"
                      >
                        Re-upload
                      </button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleImport}
                        className="px-10 py-3 bg-slate-900 text-white rounded-xl font-black shadow-xl flex items-center justify-center gap-3 hover:bg-purple-600 transition-all uppercase text-xs tracking-widest"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Complete Import
                      </motion.button>
                    </div>
                  </div>

                  <div className="overflow-auto max-h-[600px]">
                    <table className="w-full border-collapse">
                      <thead className="bg-white sticky top-0 z-10 shadow-sm">
                        <tr>
                          {headers.map(h => {
                            const isMapped = Object.values(mapping).includes(h);
                            return (
                              <th key={h} className={`px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest border-b border-slate-100 ${isMapped ? 'text-purple-600 bg-purple-50/50' : 'text-slate-300'}`}>
                                {h}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {csvData.slice(0, 100).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            {headers.map(h => {
                              const isMappedToFrequency = mapping['frequency'] === h;
                              const isMapped = Object.values(mapping).includes(h);

                              return (
                                <td key={h} className={`px-4 py-2 border-r border-slate-50 last:border-0`}>
                                  {isMapped ? (
                                    isMappedToFrequency ? (
                                      <select
                                        value={row[h] || ''}
                                        onChange={(e) => updateCsvCell(i, h, e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500"
                                      >
                                        <option value="">Select Frequency</option>
                                        {Object.keys(freqMap).map(f => (
                                          <option key={f} value={f}>{f}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        type="text"
                                        value={row[h] || ''}
                                        onChange={(e) => updateCsvCell(i, h, e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500"
                                      />
                                    )
                                  ) : (
                                    <span className="text-slate-300 opacity-40 italic px-2">{row[h] || '—'}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 4: Import Status */}
            {currentStep === 4 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 p-12 md:p-20 flex flex-col items-center text-center"
              >
                <div className="relative mb-12">
                  <svg className="w-32 h-32 transform -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="58"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="transparent"
                      className="text-slate-100"
                    />
                    <motion.circle
                      cx="64"
                      cy="64"
                      r="58"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="transparent"
                      strokeDasharray="364.4"
                      initial={{ strokeDashoffset: 364.4 }}
                      animate={{ strokeDashoffset: importStatus.total > 0 ? 364.4 - (364.4 * (importStatus.success + importStatus.failed) / importStatus.total) : 364.4 }}
                      className="text-purple-600"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-900">
                      {importStatus.total > 0 ? Math.round(((importStatus.success + importStatus.failed) / importStatus.total) * 100) : 0}%
                    </span>
                  </div>
                </div>

                <h2 className="text-3xl font-black text-slate-900 mb-2">Processing Data...</h2>
                <p className="text-slate-500 font-medium mb-12">Syncing {importStatus.total} records with {MODULES[activeModule].table}</p>

                <div className="grid grid-cols-2 gap-8 w-full max-w-md">
                  <div className="bg-green-50 p-6 rounded-3xl border border-green-100 text-center">
                    <span className="text-2xl font-black text-green-600 block">{importStatus.success}</span>
                    <span className="text-[10px] font-black text-green-700 uppercase tracking-widest">Successful</span>
                  </div>
                  <div className="bg-red-50 p-6 rounded-3xl border border-red-100 text-center">
                    <span className="text-2xl font-black text-red-600 block">{importStatus.failed}</span>
                    <span className="text-[10px] font-black text-red-700 uppercase tracking-widest">Failed</span>
                  </div>
                </div>

                {importStatus.success + importStatus.failed === importStatus.total && !isImporting && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => navigate('/dashboard/admin')}
                    className="mt-12 px-10 py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl"
                  >
                    Back to Dashboard
                  </motion.button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </AdminLayout>

    {/* Field Alignment Modal */}
    <AnimatePresence>
      {showFormatModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowFormatModal(false)}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-6xl overflow-hidden"
          >
            <div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-8 text-white relative">
              <button
                onClick={() => setShowFormatModal(false)}
                className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Table className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight">Field Format</h3>
                  <p className="text-purple-100 text-xs font-bold uppercase tracking-widest">Required CSV Structure</p>
                </div>
              </div>
            </div>

            <div className="p-8">
              <div className="mb-8">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2 px-1">
                  <Info className="w-3 h-3" /> Column Header Alignment: Provide data according to format below
                </p>
                <div className="overflow-x-auto bg-slate-50 rounded-2xl border border-slate-200 shadow-inner p-1">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr>
                        {MODULES[activeModule].fields.map((field) => (
                          <th key={field.key} className="px-6 py-4 text-left border-r border-slate-200 last:border-0 min-w-[140px]">
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight whitespace-nowrap">
                                {field.label}
                              </span>
                              {field.required ? (
                                <span className="text-[8px] font-black text-red-500 uppercase tracking-tighter bg-red-50 px-1.5 py-0.5 rounded w-fit">
                                  Required
                                </span>
                              ) : (
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter bg-slate-100 px-1.5 py-0.5 rounded w-fit">
                                  Optional
                                </span>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white">
                        {MODULES[activeModule].fields.map((field) => (
                          <td key={field.key} className="px-6 py-5 border-r border-slate-200 last:border-0 bg-slate-50/30">
                            <span className="text-[10px] font-bold text-slate-400 italic">
                              {PLACEHOLDERS[field.key] || "e.g. Sample Data"}
                            </span>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={downloadCsvTemplate}
                    className="py-5 bg-white border-2 border-slate-900 text-slate-900 rounded-2xl font-black shadow-lg flex items-center justify-center gap-3 hover:bg-slate-50 transition-all"
                  >
                    <Download className="w-5 h-5" />
                    Download Template
                  </motion.button>

                  <label className="cursor-pointer group">
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => {
                        handleFileUpload(e);
                        setShowFormatModal(false);
                      }}
                    />
                    <div className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-purple-600 transition-all flex items-center justify-center gap-3">
                      {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                      {isProcessing ? 'Processing...' : 'Upload CSV Now'}
                    </div>
                  </label>
                </div>
                
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <span className="text-[10px] text-slate-500 font-bold uppercase">
                      Frequency: {activeModule === 'delegation' 
                        ? 'One Time' 
                        : 'Daily, Alternate Day, Weekly, Fortnight, Monthly, Quarterly, Half Yearly, Yearly'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Date Format: MM/DD/YYYY</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </>
  );
};

export default BulkImport;
