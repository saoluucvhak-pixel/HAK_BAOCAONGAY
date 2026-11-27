import { computeReports } from './report-batch.js';

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: computeReports(data) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
