import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Wrench, Droplet, Circle, AlertCircle, CheckCircle2, Plus, Calendar, Gauge } from 'lucide-react';
import { MaintenanceTask } from '../types';
import { cn } from '../lib/utils';

interface MaintenanceTabProps {
  tasks: MaintenanceTask[];
  totalMileage: number;
  onCompleteTask: (id: string) => void;
  onAddTask: (task: Omit<MaintenanceTask, 'id'>) => void;
}

export default function MaintenanceTab({ tasks, totalMileage, onCompleteTask, onAddTask }: MaintenanceTabProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTask, setNewTask] = useState<Partial<MaintenanceTask>>({
    name: '',
    type: 'oil_change',
    intervalMiles: 5000,
    intervalMonths: 6,
  });

  const getTaskStatus = (task: MaintenanceTask) => {
    const milesSince = totalMileage - task.lastCompletedMiles;
    const monthsSince = (Date.now() - task.lastCompletedDate) / (1000 * 60 * 60 * 24 * 30);
    
    const milesProgress = Math.min(100, (milesSince / task.intervalMiles) * 100);
    const timeProgress = Math.min(100, (monthsSince / task.intervalMonths) * 100);
    
    const progress = Math.max(milesProgress, timeProgress);
    
    let status: 'good' | 'warning' | 'critical' = 'good';
    if (progress >= 100) status = 'critical';
    else if (progress >= 80) status = 'warning';

    return { progress, status, milesSince, monthsSince };
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'oil_change': return <Droplet size={20} />;
      case 'tire_rotation': return <Circle size={20} />;
      case 'brake_pads': return <AlertCircle size={20} />;
      default: return <Wrench size={20} />;
    }
  };

  const handleAddTask = () => {
    if (newTask.name && newTask.intervalMiles && newTask.intervalMonths) {
      onAddTask({
        name: newTask.name,
        type: newTask.type as any,
        intervalMiles: Number(newTask.intervalMiles),
        intervalMonths: Number(newTask.intervalMonths),
        lastCompletedMiles: totalMileage,
        lastCompletedDate: Date.now(),
      });
      setShowAddForm(false);
      setNewTask({ name: '', type: 'oil_change', intervalMiles: 5000, intervalMonths: 6 });
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Header Stats */}
      <div className="glass-card p-6 rounded-3xl border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-car-accent/10 rounded-full blur-3xl -mr-10 -mt-10" />
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-car-accent/20 text-car-accent rounded-2xl">
            <Gauge size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {Math.round(totalMileage).toLocaleString()} <span className="text-sm text-white/40 font-normal">mi</span>
            </h2>
            <p className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Total Vehicle Mileage</p>
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Maintenance Schedule</h3>
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/60 transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>

        {showAddForm && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="glass-card p-4 rounded-2xl space-y-4 border border-white/5"
          >
            <input
              type="text"
              placeholder="Task Name (e.g., Oil Change)"
              value={newTask.name}
              onChange={e => setNewTask({...newTask, name: e.target.value})}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-car-accent"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">Interval (Miles)</label>
                <input
                  type="number"
                  value={newTask.intervalMiles}
                  onChange={e => setNewTask({...newTask, intervalMiles: Number(e.target.value)})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-car-accent"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">Interval (Months)</label>
                <input
                  type="number"
                  value={newTask.intervalMonths}
                  onChange={e => setNewTask({...newTask, intervalMonths: Number(e.target.value)})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-car-accent"
                />
              </div>
            </div>
            <select
              value={newTask.type}
              onChange={e => setNewTask({...newTask, type: e.target.value as any})}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-car-accent"
            >
              <option value="oil_change">Oil Change</option>
              <option value="tire_rotation">Tire Rotation</option>
              <option value="brake_pads">Brake Pads</option>
              <option value="air_filter">Air Filter</option>
              <option value="custom">Custom</option>
            </select>
            <button
              onClick={handleAddTask}
              className="w-full py-2 bg-car-accent text-white rounded-xl text-sm font-bold hover:bg-car-accent/80 transition-colors"
            >
              Add Task
            </button>
          </motion.div>
        )}

        {tasks.map(task => {
          const { progress, status, milesSince, monthsSince } = getTaskStatus(task);
          const isCritical = status === 'critical';
          const isWarning = status === 'warning';

          return (
            <motion.div 
              key={task.id}
              layout
              className={cn(
                "glass-card p-5 rounded-2xl border transition-colors",
                isCritical ? "border-car-danger/30 bg-car-danger/5" : 
                isWarning ? "border-yellow-500/30 bg-yellow-500/5" : "border-white/5"
              )}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-xl",
                    isCritical ? "bg-car-danger/20 text-car-danger" : 
                    isWarning ? "bg-yellow-500/20 text-yellow-500" : "bg-white/5 text-white/60"
                  )}>
                    {getIcon(task.type)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{task.name}</h4>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider">
                      Every {task.intervalMiles.toLocaleString()}mi / {task.intervalMonths}mo
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onCompleteTask(task.id)}
                  className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] uppercase tracking-wider text-white/60 transition-colors"
                >
                  <CheckCircle2 size={12} />
                  Complete
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className={cn(
                    isCritical ? "text-car-danger" : isWarning ? "text-yellow-500" : "text-white/40"
                  )}>
                    {Math.round(milesSince).toLocaleString()} mi since last
                  </span>
                  <span className="text-white/40">
                    {Math.round(monthsSince * 10) / 10} mo ago
                  </span>
                </div>
                <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                  <motion.div 
                    className={cn(
                      "h-full rounded-full",
                      isCritical ? "bg-car-danger" : isWarning ? "bg-yellow-500" : "bg-car-accent"
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
        
        {tasks.length === 0 && (
          <div className="text-center py-8 text-white/40 text-sm">
            No maintenance tasks scheduled.
          </div>
        )}
      </div>
    </div>
  );
}
