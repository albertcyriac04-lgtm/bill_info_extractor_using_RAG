import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Trash2, Sun, Moon, FileText, MessageSquare, 
  Sparkles, Plus, AlertCircle, CheckCircle2, ChevronRight, Play
} from 'lucide-react';

function App() {
  // --- State Configuration ---
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('groq_api_key') || '';
  });
  const [apiBaseUrl, setApiBaseUrl] = useState(() => {
    return localStorage.getItem('api_base_url') || 'https://api.groq.com/openai/v1';
  });
  const [textModel, setTextModel] = useState('llama-3.3-70b-versatile');
  const [customTextModel, setCustomTextModel] = useState(() => {
    return localStorage.getItem('custom_text_model') || '';
  });
  const [visionModel, setVisionModel] = useState('llama-3.2-11b-vision-preview');
  const [customVisionModel, setCustomVisionModel] = useState(() => {
    return localStorage.getItem('custom_vision_model') || '';
  });
  
  const [bills, setBills] = useState(() => {
    const saved = localStorage.getItem('processed_bills');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedBillIndex, setSelectedBillIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [chatHistory, setChatHistory] = useState(() => {
    const saved = localStorage.getItem('chat_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentQuery, setCurrentQuery] = useState('');
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('app_theme') || 'dark';
  });

  const chatEndRef = useRef(null);

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem('groq_api_key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('api_base_url', apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    localStorage.setItem('custom_text_model', customTextModel);
  }, [customTextModel]);

  useEffect(() => {
    localStorage.setItem('custom_vision_model', customVisionModel);
  }, [customVisionModel]);

  useEffect(() => {
    localStorage.setItem('processed_bills', JSON.stringify(bills));
  }, [bills]);

  useEffect(() => {
    localStorage.setItem('chat_history', JSON.stringify(chatHistory));
  }, [chatHistory]);

  useEffect(() => {
    localStorage.setItem('app_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, isChatting]);

  // --- Theme Toggle ---
  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // --- File Upload Handler ---
  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!apiKey) {
      setUploadError('Please enter a Groq API Key in the sidebar before uploading.');
      return;
    }

    setUploadError('');
    setUploadSuccess('');
    setIsUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('apiKey', apiKey);
      formData.append('textModel', textModel === 'custom' ? customTextModel : textModel);
      formData.append('visionModel', visionModel === 'custom' ? customVisionModel : visionModel);
      formData.append('apiBase', apiBaseUrl);

      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || 'Failed to extract structured data.');
        }

        const data = await response.json();
        setBills(prev => [...prev, data]);
        setSelectedBillIndex(bills.length);
        setUploadSuccess(`Successfully processed ${file.name}`);
      } catch (err) {
        console.error(err);
        setUploadError(`Error processing ${file.name}: ${err.message}`);
      }
    }

    setIsUploading(false);
    // Clear input value so same file can be uploaded again
    event.target.value = null;
  };

  // --- Remove Bill ---
  const removeBill = (indexToRemove) => {
    const updated = bills.filter((_, idx) => idx !== indexToRemove);
    setBills(updated);
    if (selectedBillIndex >= updated.length) {
      setSelectedBillIndex(Math.max(0, updated.length - 1));
    }
  };

  // --- Reset Application State ---
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all bills and chat history?')) {
      setBills([]);
      setSelectedBillIndex(0);
      setChatHistory([]);
      setUploadSuccess('');
      setUploadError('');
      localStorage.removeItem('processed_bills');
      localStorage.removeItem('chat_history');
    }
  };

  // --- Q&A / Chat Submission ---
  const handleChatSubmit = async (e, directQuery = null) => {
    if (e) e.preventDefault();
    const query = directQuery || currentQuery;
    if (!query.trim()) return;

    if (!apiKey) {
      alert('Please enter your Groq API Key in the sidebar.');
      return;
    }

    if (bills.length === 0) {
      alert('Please upload and process at least one bill first.');
      return;
    }

    // Append user query to chat history
    const userMessage = { role: 'user', content: query };
    setChatHistory(prev => [...prev, userMessage]);
    setCurrentQuery('');
    setIsChatting(true);

    try {
      // Setup payload matching ChatRequest schema
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          history: [...chatHistory, userMessage],
          bills: bills,
          apiKey: apiKey,
          model: textModel === 'custom' ? customTextModel : textModel,
          apiBase: apiBaseUrl
        }),
      });

      if (!response.ok) {
        throw new Error('API server returned an error during streaming.');
      }

      // Initialize assistant bubble
      const assistantMessageIndex = chatHistory.length + 1;
      setChatHistory(prev => [...prev, { role: 'assistant', content: '' }]);

      // Read response stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantText += chunk;

        setChatHistory(prev => {
          const updated = [...prev];
          if (updated[assistantMessageIndex]) {
            updated[assistantMessageIndex].content = assistantText;
          }
          return updated;
        });
      }
    } catch (err) {
      console.error(err);
      setChatHistory(prev => [
        ...prev,
        { role: 'assistant', content: `⚠️ **Error generating response:** ${err.message}` }
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  // --- Custom Markdown Formatter ---
  const formatMarkdown = (text) => {
    if (!text) return '';
    
    // Simple HTML escaping
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headings
    html = html.replace(/^### (.*?)$/gm, '<h4 class="md-h3">$1</h4>');
    html = html.replace(/^## (.*?)$/gm, '<h3 class="md-h2">$1</h3>');
    html = html.replace(/^# (.*?)$/gm, '<h2 class="md-h1">$1</h2>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Code blocks
    html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');

    // Bullet Lists
    let inList = false;
    const lines = html.split('\n');
    const formattedLines = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const content = trimmed.substring(2);
        if (!inList) {
          inList = true;
          return `<ul class="md-list"><li>${content}</li>`;
        }
        return `<li>${content}</li>`;
      } else {
        if (inList) {
          inList = false;
          return `</ul>\n${line}`;
        }
        return line;
      }
    });
    if (inList) {
      formattedLines.push('</ul>');
    }
    html = formattedLines.join('\n');

    // Line breaks
    html = html.replace(/\n/g, '<br>');
    
    return html;
  };

  // --- Calculations for Dashboard ---
  const getDashboardStats = () => {
    if (bills.length === 0) return { total: 0, count: 0, avg: 0, vendors: 0, currency: 'USD' };
    
    const uniqueVendors = new Set();
    const currency_totals = {};
    
    bills.forEach(bill => {
      const v = bill.vendor_name || 'Unknown';
      uniqueVendors.add(v);
      
      const amt = parseFloat(bill.total_amount);
      const curr = bill.currency || 'USD';
      
      if (!isNaN(amt)) {
        currency_totals[curr] = (currency_totals[curr] || 0) + amt;
      }
    });

    const currencies = Object.keys(currency_totals);
    const primaryCurrency = currencies.includes('USD') ? 'USD' : (currencies[0] || 'USD');
    const totalSpend = currency_totals[primaryCurrency] || 0;
    const count = bills.length;
    const avg = count > 0 ? totalSpend / count : 0;
    
    return {
      total: totalSpend,
      count,
      avg,
      vendors: uniqueVendors.size,
      currency: primaryCurrency,
      multiCurrency: currencies.length > 1
    };
  };

  const stats = getDashboardStats();
  const selectedBill = bills[selectedBillIndex];

  return (
    <div className="app-container">
      {/* --- Sidebar Configuration Panel --- */}
      <aside className="sidebar">
        <div>
          <div className="brand" style={{ marginBottom: '1.5rem' }}>
            <span className="brand-icon">🧾</span>
            <div>
              <h1 className="brand-name">BillWise RAG</h1>
              <span className="brand-version">Serverless v1.0</span>
            </div>
          </div>
          
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label">API Base URL</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="https://api.groq.com/openai/v1"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label">API Key</label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="Paste your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label">Model (Text / RAG)</label>
            <select 
              className="form-control"
              value={textModel}
              onChange={(e) => setTextModel(e.target.value)}
            >
              <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
              <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
              <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
              <option value="openai/gpt-oss-120b">openai/gpt-oss-120b</option>
              <option value="custom">Custom Model...</option>
            </select>
            {textModel === 'custom' && (
              <input 
                type="text" 
                className="form-control" 
                style={{ marginTop: '0.5rem' }}
                placeholder="Enter custom model name (e.g. gpt-4o)"
                value={customTextModel}
                onChange={(e) => setCustomTextModel(e.target.value)}
              />
            )}
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label">Model (Vision/Images)</label>
            <select 
              className="form-control"
              value={visionModel}
              onChange={(e) => setVisionModel(e.target.value)}
            >
              <option value="llama-3.2-11b-vision-preview">llama-3.2-11b-vision-preview</option>
              <option value="llama-3.2-90b-vision-preview">llama-3.2-90b-vision-preview</option>
              <option value="custom">Custom Vision Model...</option>
            </select>
            {visionModel === 'custom' && (
              <input 
                type="text" 
                className="form-control" 
                style={{ marginTop: '0.5rem' }}
                placeholder="Enter custom vision model name"
                value={customVisionModel}
                onChange={(e) => setCustomVisionModel(e.target.value)}
              />
            )}
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label">Upload Documents</label>
            <label className="file-upload-zone">
              <Upload className="file-upload-icon" style={{ margin: '0 auto 0.5rem', color: 'var(--accent)' }} />
              <div className="file-upload-text"><strong>Click to upload</strong> or drag PDF / Image</div>
              <input 
                type="file" 
                multiple 
                accept=".pdf,.png,.jpg,.jpeg" 
                style={{ display: 'none' }} 
                onChange={handleFileUpload}
              />
            </label>
          </div>

          {isUploading && (
            <div className="loading-container" style={{ marginBottom: '1rem' }}>
              <div className="spinner"></div>
              <span>Processing document...</span>
            </div>
          )}

          {uploadError && (
            <div className="badge badge-red" style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem', justifyContent: 'flex-start', gap: '0.4rem', borderRadius: '6px' }}>
              <AlertCircle size={14} />
              <span style={{ fontSize: '0.75rem', textAlign: 'left', wordBreak: 'break-word' }}>{uploadError}</span>
            </div>
          )}
          
          {uploadSuccess && (
            <div className="badge badge-green" style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem', justifyContent: 'flex-start', gap: '0.4rem', borderRadius: '6px' }}>
              <CheckCircle2 size={14} />
              <span style={{ fontSize: '0.75rem', textAlign: 'left' }}>{uploadSuccess}</span>
            </div>
          )}
        </div>

        {/* List of uploaded invoices in sidebar */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label className="form-label">Uploaded Invoices ({bills.length})</label>
          <div className="bill-list-sidebar">
            {bills.map((bill, idx) => (
              <div key={idx} className="bill-sidebar-item">
                <span className="bill-sidebar-name">{bill.vendor_name || 'Invoice'}</span>
                <button className="bill-sidebar-remove" onClick={() => removeBill(idx)}>×</button>
              </div>
            ))}
          </div>

          {bills.length > 0 && (
            <button className="btn btn-danger" onClick={handleClearAll} style={{ width: '100%' }}>
              <Trash2 size={14} /> Clear All State
            </button>
          )}
        </div>
      </aside>

      {/* --- Main Contents Panel --- */}
      <main className="main-content">
        <header className="header">
          {/* Navigation Tab selection */}
          <div className="tabs-header">
            <button 
              className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              📊 Overview & Dashboard
            </button>
            <button 
              className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              💬 Bill Chat Assistant
            </button>
          </div>

          <button className="btn btn-secondary" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
          </button>
        </header>

        {/* --- Tab Content: Dashboard --- */}
        {activeTab === 'dashboard' && (
          <div>
            {bills.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '5rem 2rem', 
                backgroundColor: 'var(--bg-subtle)', 
                border: '1px dashed var(--border)', 
                borderRadius: 'var(--radius)',
                marginTop: '1rem'
              }}>
                <FileText size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
                <h3 style={{ marginBottom: '0.5rem', fontWeight: 600 }}>No Invoices Extracted Yet</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>
                  Paste your Groq API Key and upload bills (PDFs or screenshots) in the sidebar. We will automatically perform parsing and show structured analytics here.
                </p>
              </div>
            ) : (
              <div>
                {/* KPI Metrics Dashboard Row */}
                <div className="metric-grid">
                  <div className="metric-card">
                    <div className="metric-label">Total Spend ({stats.currency})</div>
                    <div className="metric-value">{stats.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    {stats.multiCurrency && (
                      <span style={{ fontSize: '0.68rem', color: 'var(--amber)', fontWeight: 600 }}>*Multiple currencies detected</span>
                    )}
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Processed Bills</div>
                    <div className="metric-value">{stats.count}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Average Bill</div>
                    <div className="metric-value">{stats.avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Unique Vendors</div>
                    <div className="metric-value">{stats.vendors}</div>
                  </div>
                </div>

                {/* Dashboard layout splits */}
                <div className="dashboard-grid">
                  {/* Left: Table of Bills */}
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Document Catalog</h3>
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Merchant / Vendor</th>
                            <th>Invoice #</th>
                            <th>Date</th>
                            <th>Due Date</th>
                            <th style={{ textAlign: 'right' }}>Total Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bills.map((bill, index) => {
                            const isSelected = index === selectedBillIndex;
                            const amt = parseFloat(bill.total_amount);
                            const amtStr = isNaN(amt) ? 'N/A' : amt.toLocaleString(undefined, { minimumFractionDigits: 2 });
                            return (
                              <tr 
                                key={index} 
                                className={isSelected ? 'selected' : ''}
                                onClick={() => setSelectedBillIndex(index)}
                              >
                                <td><strong>{bill.vendor_name || 'Unknown'}</strong></td>
                                <td>{bill.invoice_number || 'N/A'}</td>
                                <td>{bill.invoice_date || 'N/A'}</td>
                                <td>
                                  {bill.due_date ? (
                                    <span className="badge badge-amber">{bill.due_date}</span>
                                  ) : (
                                    <span className="badge badge-blue">Pending</span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                                  {amtStr} {bill.currency || 'USD'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right: Detailed Bill Inspector Panel */}
                  {selectedBill && (
                    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="inspector-header">
                        <span className="badge badge-blue" style={{ marginBottom: '0.5rem' }}>Invoice Metadata</span>
                        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--accent)' }}>
                          {selectedBill.vendor_name || 'Vendor'}
                        </h2>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          {selectedBill.summary || 'Summary not extracted.'}
                        </p>
                      </div>

                      <div className="inspector-details">
                        <div className="inspector-item">
                          <span className="inspector-label">Invoice Number</span>
                          <span className="inspector-value">{selectedBill.invoice_number || 'N/A'}</span>
                        </div>
                        <div className="inspector-item">
                          <span className="inspector-label">Total Amount</span>
                          <span className="inspector-value" style={{ color: 'var(--green)', fontSize: '1rem' }}>
                            {parseFloat(selectedBill.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {selectedBill.currency || 'USD'}
                          </span>
                        </div>
                        <div className="inspector-item">
                          <span className="inspector-label">Invoice Date</span>
                          <span className="inspector-value">{selectedBill.invoice_date || 'N/A'}</span>
                        </div>
                        <div className="inspector-item">
                          <span className="inspector-label">Due Date</span>
                          <span className="inspector-value">{selectedBill.due_date || 'N/A'}</span>
                        </div>
                        <div className="inspector-item">
                          <span className="inspector-label">Tax Amount</span>
                          <span className="inspector-value">
                            {parseFloat(selectedBill.tax_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {selectedBill.currency || 'USD'}
                          </span>
                        </div>
                        <div className="inspector-item">
                          <span className="inspector-label">Source File</span>
                          <span className="inspector-value" style={{ fontSize: '0.78rem', wordBreak: 'break-all' }}>
                            {selectedBill._filename || 'Uploaded File'}
                          </span>
                        </div>
                      </div>

                      <hr style={{ borderColor: 'var(--border-subtle)' }} />

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>Itemized Charges</h4>
                        <div className="table-container">
                          <table className="data-table" style={{ fontSize: '0.78rem' }}>
                            <thead>
                              <tr>
                                <th>Description</th>
                                <th style={{ textAlign: 'center', width: '50px' }}>Qty</th>
                                <th style={{ textAlign: 'right', width: '90px' }}>Unit Price</th>
                                <th style={{ textAlign: 'right', width: '90px' }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Array.isArray(selectedBill.line_items) && selectedBill.line_items.length > 0 ? (
                                selectedBill.line_items.map((item, idx) => {
                                  const uPrice = parseFloat(item.unit_price);
                                  const tPrice = parseFloat(item.total_price);
                                  return (
                                    <tr key={idx}>
                                      <td>{item.description || 'N/A'}</td>
                                      <td style={{ textAlign: 'center' }}>{item.quantity || 1}</td>
                                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                        {isNaN(uPrice) ? 'N/A' : uPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </td>
                                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                                        {isNaN(tPrice) ? 'N/A' : tPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                    No item breakdown extracted.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- Tab Content: RAG Chat Assistant --- */}
        {activeTab === 'chat' && (
          <div className="chat-container">
            {/* Chat message logs */}
            <div className="chat-history">
              {chatHistory.length === 0 ? (
                <div style={{ 
                  margin: 'auto', 
                  textAlign: 'center', 
                  maxWidth: '400px', 
                  color: 'var(--text-muted)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  alignItems: 'center'
                }}>
                  <MessageSquare size={36} style={{ color: 'var(--text-dim)' }} />
                  <h4 style={{ fontWeight: 600, color: 'var(--text)' }}>Ask anything about your bills</h4>
                  <p style={{ fontSize: '0.85rem' }}>
                    Type questions below or click a quick prompt suggestion. The AI will look up dates, math, items, and vendors to answer.
                  </p>
                </div>
              ) : (
                chatHistory.map((message, index) => {
                  const isUser = message.role === 'user';
                  return (
                    <div key={index} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                      <div className={`chat-meta ${message.role}`}>
                        <span>{isUser ? '👤 You' : '🤖 BillWise AI'}</span>
                      </div>
                      <div 
                        className={`chat-message ${message.role}`}
                        dangerouslySetInnerHTML={{ __html: isUser ? formatMarkdown(message.content) : formatMarkdown(message.content) }}
                      />
                    </div>
                  );
                })
              )}

              {isChatting && (
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <div className="chat-meta assistant">
                    <span>🤖 BillWise AI</span>
                  </div>
                  <div className="chat-message assistant" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.8 }}>
                    <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', margin: 0 }}></div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Thinking...</span>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Prompt Suggestion Chips */}
            <div className="suggestions-panel">
              <button 
                className="suggestion-chip"
                onClick={(e) => handleChatSubmit(e, 'What is my total spend across all bills?')}
                disabled={bills.length === 0 || isChatting}
              >
                📊 What is my total spend?
              </button>
              <button 
                className="suggestion-chip"
                onClick={(e) => handleChatSubmit(e, 'Which bills are due next?')}
                disabled={bills.length === 0 || isChatting}
              >
                📅 Which bills are due next?
              </button>
              <button 
                className="suggestion-chip"
                onClick={(e) => handleChatSubmit(e, 'Compare the amounts and dates of my bills.')}
                disabled={bills.length === 0 || isChatting}
              >
                ⚖️ Compare amounts & dates
              </button>
              <button 
                className="suggestion-chip"
                onClick={(e) => handleChatSubmit(e, 'List all line items purchased across all invoices.')}
                disabled={bills.length === 0 || isChatting}
              >
                🛒 List all item descriptions
              </button>
            </div>

            {/* Input field */}
            <div className="chat-input-area">
              <form className="chat-form" onSubmit={handleChatSubmit}>
                <input 
                  type="text" 
                  className="chat-input"
                  placeholder={bills.length === 0 ? "Upload bills in the sidebar to enable chat..." : "Ask a question about invoices (e.g. 'How much tax did I pay at Amazon?')..."}
                  value={currentQuery}
                  onChange={(e) => setCurrentQuery(e.target.value)}
                  disabled={bills.length === 0 || isChatting}
                />
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={!currentQuery.trim() || bills.length === 0 || isChatting}
                >
                  Send <Play size={10} fill="white" />
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
