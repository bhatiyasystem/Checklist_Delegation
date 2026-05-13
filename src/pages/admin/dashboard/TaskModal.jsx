import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, ListTodo, CheckCircle2, Clock, AlertTriangle, User, Calendar, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchDashboardDataApi } from '../../../redux/api/dashboardApi';

const TaskModal = ({ isOpen, onClose, type, title, dashboardType, staffFilter, departmentFilter, dateRange }) => {
  const [tasks, setTasks] = useState([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const scrollRef = useRef(null);
  const limit = 20;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset and fetch when modal opens or filters change
  useEffect(() => {
    if (isOpen) {
      setTasks([]);
      setPage(1);
      setHasMore(true);
      fetchTasks(1, debouncedSearch, true);
    }
  }, [isOpen, type, dashboardType, staffFilter, departmentFilter, dateRange, debouncedSearch]);

  const fetchTasks = async (pageNum, search, reset = false) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const data = await fetchDashboardDataApi(
        dashboardType,
        staffFilter,
        pageNum,
        limit,
        type, // taskView maps to type (analyzed, completed, pending, overdue)
        departmentFilter,
        dateRange?.startDate,
        dateRange?.endDate,
        search
      );

      const processedData = (data || []).map(task => ({
        ...task,
        assignedTo: task.name || task.assigned_person || task.filled_by || 'Unknown',
        title: task.title || task.task_description || task.issue_description || 'No Title',
        taskStartDate: task.planned_date || task.task_start_date || task.created_at
          ? new Date(task.planned_date || task.task_start_date || task.created_at).toLocaleDateString()
          : 'N/A'
      }));

      if (reset) {
        setTasks(processedData);
      } else {
        setTasks(prev => [...prev, ...processedData]);
      }

      setHasMore(processedData.length === limit);
    } catch (error) {
      console.error("Error fetching tasks for modal:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScroll = useCallback(() => {
    if (!scrollRef.current || isLoading || !hasMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchTasks(nextPage, debouncedSearch);
    }
  }, [page, isLoading, hasMore, debouncedSearch]);

  const getStatusIcon = (status) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('completed') || s.includes('approved') || s === 'yes' || s === 'done') 
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (s.includes('overdue')) return <AlertTriangle className="w-4 h-4 text-rose-500" />;
    if (s.includes('pending')) return <Clock className="w-4 h-4 text-amber-500" />;
    return <ListTodo className="w-4 h-4 text-blue-500" />;
  };

  const getStatusColor = (status) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('completed') || s.includes('approved') || s === 'yes' || s === 'done')
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (s.includes('overdue')) return 'bg-rose-50 text-rose-700 border-rose-100';
    if (s.includes('pending')) return 'bg-amber-50 text-amber-700 border-amber-100';
    return 'bg-blue-50 text-blue-700 border-blue-100';
  };

  const getHeaderIcon = () => {
    switch (type) {
      case 'completed': return <CheckCircle2 className="w-6 h-6 text-emerald-500" />;
      case 'overdue': return <AlertTriangle className="w-6 h-6 text-rose-500" />;
      case 'pending': return <Clock className="w-6 h-6 text-amber-500" />;
      default: return <ListTodo className="w-6 h-6 text-blue-500" />;
    }
  };

  const getHeaderGradient = () => {
    switch (type) {
      case 'completed': return 'from-emerald-50 to-emerald-100/50 text-emerald-900 border-emerald-100';
      case 'overdue': return 'from-rose-50 to-rose-100/50 text-rose-900 border-rose-100';
      case 'pending': return 'from-amber-50 to-amber-100/50 text-amber-900 border-amber-100';
      default: return 'from-blue-50 to-blue-100/50 text-blue-900 border-blue-100';
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl max-h-[85vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-gray-100"
        >
          {/* Header */}
          <div className={`p-6 border-b bg-gradient-to-r ${getHeaderGradient()} flex items-center justify-between`}>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white rounded-2xl shadow-sm">
                {getHeaderIcon()}
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">{title}</h2>
                <p className="text-xs font-bold opacity-60 uppercase tracking-widest mt-0.5">
                  Live Database Search
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/50 rounded-xl transition-all text-gray-500 hover:text-gray-900"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Filters/Search Area - Commented out as requested */}
          {/* <div className="p-4 bg-gray-50/50 border-b border-gray-100">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-purple-500 transition-colors" />
              <input
                type="text"
                placeholder="Search database for tasks, names, or machine info..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all shadow-sm"
              />
              {isLoading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                </div>
              )}
            </div>
          </div> */}

          {/* Content Area */}
          <div 
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto p-4 custom-scrollbar"
          >
            {tasks.length === 0 && !isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                <ListTodo className="w-12 h-12 mb-3 opacity-20" />
                <p className="font-bold">No tasks found</p>
                <p className="text-xs uppercase tracking-widest opacity-60">Try adjusting your search</p>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="hidden md:grid grid-cols-12 px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                  <div className="col-span-6">Task Details</div>
                  <div className="col-span-3 text-center">Assigned To</div>
                  <div className="col-span-3 text-right">Date & Status</div>
                </div>
                {tasks.map((task, idx) => (
                  <motion.div
                    key={task.id || idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (idx % limit) * 0.02 }}
                    className="p-4 bg-white border border-gray-100 rounded-2xl hover:border-purple-200 hover:shadow-md transition-all group/item"
                  >
                    <div className="grid grid-cols-12 items-center gap-4">
                      <div className="col-span-12 md:col-span-6">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-xl border ${getStatusColor(task.status)} shrink-0`}>
                            {getStatusIcon(task.status)}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-gray-900 leading-tight group-hover/item:text-purple-700 transition-colors">
                              {task.title}
                            </h4>
                            <div className="flex flex-wrap gap-2 mt-1.5">
                              {task.frequency && (
                                <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-bold uppercase tracking-tighter">
                                  {task.frequency}
                                </span>
                              )}
                              {task.machine_name && task.machine_name !== '-' && (
                                <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-bold">
                                  {task.machine_name}
                                </span>
                              )}
                              {task.department && (
                                <span className="text-[10px] px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full font-bold">
                                  {task.department}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="col-span-6 md:col-span-3 flex md:justify-center">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-gray-100 to-gray-200 flex items-center justify-center border border-white shadow-sm overflow-hidden">
                            {task.profile_image ? (
                              <img src={task.profile_image} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-3.5 h-3.5 text-gray-400" />
                            )}
                          </div>
                          <span className="text-xs font-bold text-gray-600">{task.assignedTo}</span>
                        </div>
                      </div>

                      <div className="col-span-6 md:col-span-3 flex flex-col items-end">
                        <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                          <Calendar className="w-3 h-3" />
                          <span className="text-[10px] font-bold">{task.taskStartDate}</span>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${getStatusColor(task.status)}`}>
                          {task.status || 'Pending'}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-center p-8">
                    <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
                  </div>
                )}
                
                {!hasMore && tasks.length > 0 && (
                  <div className="text-center p-8 text-gray-400 text-[10px] font-bold uppercase tracking-widest">
                    End of results
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-gray-50/50 border-t border-gray-100 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">
              Powered by <span className="text-purple-600 font-black">Botivate</span> Audit Systems
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default TaskModal;
