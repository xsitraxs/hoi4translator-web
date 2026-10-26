// Run report generator: exports JSON and CSV reports with run statistics

export interface FileReportEntry {
  file: string;
  destination: string;
  status: 'written' | 'rejected' | 'cancelled' | 'error';
  translated: number;
  skipped: number;
  stale: number;
  recovered: number;
  broken: number;
  reused: number;
  message: string;
}

export interface BrokenReportEntry {
  file: string;
  key: string;
  issues: string[];
  recovered: boolean;
}

export class RunReport {
  public files: FileReportEntry[] = [];
  public broken: BrokenReportEntry[] = [];
  public fallbacks: Record<string, number> = {};
  public timestamp: string = new Date().toISOString();

  public recordFile(entry: FileReportEntry): void {
    this.files.push(entry);
  }

  public recordBroken(
    file: string,
    key: string,
    issues: string[],
    recovered: boolean
  ): void {
    this.broken.push({ file, key, issues, recovered });
  }

  public recordFallback(enginePair: string, count: number): void {
    this.fallbacks[enginePair] = count;
  }

  public get summary() {
    let totalTranslated = 0;
    let totalSkipped = 0;
    let totalRecovered = 0;
    let totalBroken = 0;
    let totalReused = 0;
    let writtenFiles = 0;

    for (const f of this.files) {
      totalTranslated += f.translated;
      totalSkipped += f.skipped;
      totalRecovered += f.recovered;
      totalBroken += f.broken;
      totalReused += f.reused;
      if (f.status === 'written') writtenFiles++;
    }

    return {
      totalFiles: this.files.length,
      writtenFiles,
      totalTranslated,
      totalSkipped,
      totalRecovered,
      totalBroken,
      totalReused,
    };
  }

  public toJSON(): string {
    return JSON.stringify(
      {
        timestamp: this.timestamp,
        summary: this.summary,
        files: this.files,
        broken: this.broken,
        fallbacks: this.fallbacks,
      },
      null,
      2
    );
  }

  public toCSV(): string {
    const lines = [
      'file,destination,status,translated,skipped,stale,recovered,broken,reused,message',
    ];
    for (const f of this.files) {
      lines.push(
        `"${f.file}","${f.destination}","${f.status}",${f.translated},${f.skipped},${f.stale},${f.recovered},${f.broken},${f.reused},"${f.message.replace(/"/g, '""')}"`
      );
    }
    return lines.join('\n');
  }
}
