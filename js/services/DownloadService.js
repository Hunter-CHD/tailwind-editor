/**
 * Download service
 */
export class DownloadService {
  /**
   * Download text as file
   * @param {string} content - File content
   * @param {string} filename - File name
   * @param {string} mimeType - MIME type
   */
  download(content, filename, mimeType = 'text/html') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  /**
   * Download HTML file
   * @param {string} html - HTML content
   * @param {string} filename - File name
   */
  downloadHTML(html, filename = 'exported.html') {
    this.download(html, filename, 'text/html');
  }
}
