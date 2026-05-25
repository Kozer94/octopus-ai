import { useCallback, useEffect, useState } from 'react';
import { eventsApi, runtimeApi } from '../services/apiClient';

export function useRuntimeInspector({ rightPanelTab }) {
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [runtimeTasks, setRuntimeTasks] = useState([]);
  const [runtimeGraph, setRuntimeGraph] = useState(null);
  const [runtimeTree, setRuntimeTree] = useState(null);
  const [runtimeTrace, setRuntimeTrace] = useState(null);
  const [runtimeReplay, setRuntimeReplay] = useState(null);
  const [runtimeControlPlane, setRuntimeControlPlane] = useState(null);
  const [runtimeWorkers, setRuntimeWorkers] = useState([]);
  const [runtimeMetrics, setRuntimeMetrics] = useState(null);
  const [selectedRuntimeTask, setSelectedRuntimeTask] = useState(null);

  useEffect(() => {
    const eventSource = new EventSource(eventsApi.streamUrl({ replay: true }));
    eventSource.onmessage = message => {
      const event = JSON.parse(message.data);
      setTimelineEvents(prev => [...prev.filter(item => item.id !== event.id), event].slice(-150));
    };
    return () => eventSource.close();
  }, []);

  const refreshRuntimeInspector = useCallback(async () => {
    const [tasksData, metricsData, controlPlaneData] = await Promise.all([
      runtimeApi.tasks(),
      runtimeApi.metrics(),
      runtimeApi.controlPlane(),
    ]);
    const tasks = tasksData.tasks || [];
    setRuntimeTasks(tasks);
    setRuntimeMetrics(metricsData.metrics || null);
    setRuntimeControlPlane(controlPlaneData.controlPlane || null);
    setSelectedRuntimeTask(current => {
      if (!current) return tasks[0] || null;
      return tasks.find(task => task.id === current.id) || tasks[0] || null;
    });

    const workflowId = tasks[0]?.workflowId;
    if (workflowId) {
      const [graphData, treeData, workersData] = await Promise.all([
        runtimeApi.graph(workflowId),
        runtimeApi.tree(workflowId),
        runtimeApi.workers(),
      ]);
      setRuntimeGraph(graphData.graph || null);
      setRuntimeTree(treeData.tree || null);
      setRuntimeWorkers(workersData.workers || []);
    } else {
      setRuntimeGraph(null);
      setRuntimeTree(null);
      setRuntimeWorkers([]);
    }
  }, []);

  useEffect(() => {
    if (rightPanelTab !== 'inspector') return;
    const timer = setTimeout(() => {
      refreshRuntimeInspector().catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshRuntimeInspector, rightPanelTab]);

  useEffect(() => {
    if (!selectedRuntimeTask?.traceId) {
      const timer = setTimeout(() => {
        setRuntimeTrace(null);
        setRuntimeReplay(null);
      }, 0);
      return () => clearTimeout(timer);
    }
    let cancelled = false;
    Promise.all([
      runtimeApi.trace(selectedRuntimeTask.traceId),
      runtimeApi.replayV2(selectedRuntimeTask.traceId),
    ])
      .then(([traceData, replayData]) => {
        if (cancelled) return;
        setRuntimeTrace(traceData.trace || null);
        setRuntimeReplay(replayData.replay || null);
      })
      .catch(() => {
        if (cancelled) return;
        setRuntimeTrace(null);
        setRuntimeReplay(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRuntimeTask]);

  return {
    refreshRuntimeInspector,
    runtimeControlPlane,
    runtimeGraph,
    runtimeMetrics,
    runtimeReplay,
    runtimeTasks,
    runtimeTrace,
    runtimeTree,
    runtimeWorkers,
    selectedRuntimeTask,
    setSelectedRuntimeTask,
    setTimelineEvents,
    timelineEvents,
  };
}
