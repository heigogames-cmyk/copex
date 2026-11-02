export function recoverJobs(jobs) {
  for (const job of jobs) {
    job.stopping = false;
    if (job.status === "cancelled") {
      for (const item of job.items || [])
        if (["queued", "running"].includes(item.status))
          item.status = "cancelled";
      continue;
    }
    if (!["queued", "running"].includes(job.status)) continue;
    const message =
      "O servidor foi reiniciado. Execute novamente os itens interrompidos.";
    for (const item of job.items || []) {
      if (["queued", "running"].includes(item.status)) {
        item.status = "failed";
        item.error = message;
      }
    }
    job.status =
      job.items?.length && job.items.every((item) => item.status === "done")
        ? "done"
        : job.outputs?.length
          ? "partial"
          : "failed";
    job.error = job.status === "done" ? null : message;
    job.finishedAt = new Date().toISOString();
  }
}
