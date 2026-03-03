let allSubscriptions = [];
let filteredSubscriptions = [];
let categoryChart, trendChart;

const API_BASE = window.location.origin;

const CATEGORY_COLORS = {
  'Entertainment': '#ef4444',
  'Productivity': '#3b82f6',
  'Cloud/Hosting': '#8b5cf6',
  'Software/Tools': '#06b6d4',
  'Storage': '#10b981',
  'Domains/Hosting': '#f59e0b',
  'Memberships': '#ec4899',
  'Fitness': '#14b8a6',
  'Insurance': '#6366f1',
  'Utilities': '#f97316',
  'Other': '#6b7280'
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  showLoading();
  await loadStats();
  await loadSubscriptions();
  await loadInsights();
  await loadCategoryData();
  await loadSpendingTrend();
  await populateFilters();
  hideLoading();
  
  document.getElementById('account-info').textContent = 'petarceklic@gmail.com';
  
  // Auto-refresh every hour
  setInterval(async () => {
    await loadStats();
    await loadSubscriptions();
    await loadInsights();
  }, 60 * 60 * 1000);
});

function showLoading() {
  document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

async function loadStats() {
  try {
    const response = await fetch(`${API_BASE}/api/stats`);
    const data = await response.json();
    if (data.success) {
      document.getElementById('stat-monthly').textContent = `$${data.stats.totalMonthly}`;
      document.getElementById('stat-yearly').textContent = `$${data.stats.totalYearly}`;
      document.getElementById('stat-active').textContent = data.stats.activeCount;
      document.getElementById('stat-upcoming').textContent = data.stats.upcomingThisMonth;
      document.getElementById('stat-savings').textContent = `$${data.stats.potentialAnnualSavings}`;
      document.getElementById('stat-trials').textContent = data.stats.trialsExpiringSoon;
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

async function loadSubscriptions() {
  try {
    const response = await fetch(`${API_BASE}/api/subscriptions`);
    const data = await response.json();
    if (data.success) {
      allSubscriptions = data.subscriptions;
      filteredSubscriptions = allSubscriptions;
      updateSubscriptionsList();
    }
  } catch (error) {
    console.error('Error loading subscriptions:', error);
  }
}

async function loadInsights() {
  try {
    const response = await fetch(`${API_BASE}/api/insights`);
    const data = await response.json();
    
    const container = document.getElementById('insights-container');
    
    if (!data.success || data.insights.length === 0) {
      container.innerHTML = `
        <div class="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
          <div class="text-4xl mb-3">✅</div>
          <p>No urgent insights right now. Your subscriptions look good!</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = data.insights.map(insight => `
      <div class="insight-card insight-${insight.priority}">
        <div class="flex justify-between items-start mb-2">
          <h3 class="font-bold text-gray-900">${insight.title}</h3>
          <span class="px-2 py-1 rounded text-xs font-semibold uppercase ${getPriorityClass(insight.priority)}">
            ${insight.priority}
          </span>
        </div>
        <p class="text-sm text-gray-600 mb-3">${insight.action}</p>
        ${renderInsightDetails(insight)}
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading insights:', error);
  }
}

function renderInsightDetails(insight) {
  if (!insight.details) return '';
  
  if (Array.isArray(insight.details)) {
    return `
      <div class="mt-3 space-y-2">
        ${insight.details.slice(0, 5).map(detail => `
          <div class="text-sm bg-white bg-opacity-50 rounded p-2">
            ${typeof detail === 'object' ? Object.entries(detail).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join(' • ') : detail}
          </div>
        `).join('')}
        ${insight.details.length > 5 ? `<div class="text-sm text-gray-500 italic">...and ${insight.details.length - 5} more</div>` : ''}
      </div>
    `;
  }
  
  return `<div class="text-sm text-gray-700 mt-2">${insight.details}</div>`;
}

function getPriorityClass(priority) {
  const classes = {
    'urgent': 'bg-red-100 text-red-800',
    'high': 'bg-orange-100 text-orange-800',
    'medium': 'bg-blue-100 text-blue-800',
    'low': 'bg-green-100 text-green-800'
  };
  return classes[priority] || classes['low'];
}

async function loadCategoryData() {
  try {
    const response = await fetch(`${API_BASE}/api/analytics/categories`);
    const data = await response.json();
    
    if (!data.success || data.categories.length === 0) return;
    
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    if (categoryChart) categoryChart.destroy();
    
    categoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.categories.map(c => c.category),
        datasets: [{
          data: data.categories.map(c => c.monthly_total.toFixed(2)),
          backgroundColor: data.categories.map(c => CATEGORY_COLORS[c.category] || CATEGORY_COLORS['Other'])
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `${context.label}: $${context.parsed}/month`;
              }
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Error loading category data:', error);
  }
}

async function loadSpendingTrend() {
  try {
    const response = await fetch(`${API_BASE}/api/analytics/spending`);
    const data = await response.json();
    
    if (!data.success || data.spending.length === 0) return;
    
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    if (trendChart) trendChart.destroy();
    
    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.spending.map(s => s.month),
        datasets: [{
          label: 'Monthly Spending',
          data: data.spending.map(s => s.total.toFixed(2)),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `$${context.parsed.y}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value;
              }
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Error loading spending trend:', error);
  }
}

async function populateFilters() {
  const categories = [...new Set(allSubscriptions.map(s => s.category))].sort();
  const categoryFilter = document.getElementById('category-filter');
  
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categoryFilter.appendChild(option);
  });
}

function updateSubscriptionsList() {
  const container = document.getElementById('subscriptions-list');
  const emptyState = document.getElementById('empty-state');

  if (filteredSubscriptions.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  container.innerHTML = filteredSubscriptions.map(sub => {
    const monthlyAmount = getMonthlyAmount(sub.amount, sub.billing_frequency);
    const yearlyAmount = getYearlyAmount(sub.amount, sub.billing_frequency);

    // Format status class (handle "Likely Cancelled" with spaces)
    const statusClass = sub.status.toLowerCase().replace(/\s+/g, '-');

    // Last charged display
    const lastCharged = sub.last_charge_date ? formatRelativeDate(sub.last_charge_date) : null;
    const isOverdue = sub.days_since_last_charge && sub.days_since_last_charge > 45;

    // Source badge
    const sourceLabel = sub.source === 'csv' ? 'Bank' : 'Email';
    const sourceClass = sub.source === 'csv' ? 'source-csv' : 'source-email';

    // Confidence indicator
    const confidenceIcon = sub.confidence === 'high' ? '●●●' : sub.confidence === 'medium' ? '●●○' : '●○○';
    const confidenceClass = `confidence-${sub.confidence || 'medium'}`;

    // Serialize subscription for onclick
    const subJson = JSON.stringify(sub).replace(/"/g, '&quot;');

    return `
      <div class="bg-white rounded-lg shadow-sm p-5 hover:shadow-md transition">
        <div class="flex justify-between items-start mb-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-2 flex-wrap">
              <h3 class="text-lg font-bold text-gray-900">${sub.service_name}</h3>
              <span class="category-badge" style="background: ${CATEGORY_COLORS[sub.category] || CATEGORY_COLORS['Other']}; color: white;">
                ${sub.category}
              </span>
              <span class="px-2 py-1 rounded text-xs font-semibold status-${statusClass}">
                ${sub.status}
              </span>
              <span class="px-2 py-1 rounded text-xs font-semibold ${sourceClass}">
                ${sourceLabel}
              </span>
              ${sub.trial_status ? `<span class="px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">TRIAL</span>` : ''}
            </div>
          </div>
          <div class="flex items-start gap-2">
            <div class="text-right">
              <div class="text-2xl font-bold text-gray-900">$${sub.amount.toFixed(2)}</div>
              <div class="text-sm text-gray-500">${sub.billing_frequency}</div>
            </div>
            <div class="flex flex-col gap-1">
              <button onclick='openEditModal(${subJson})' class="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                ✏️
              </button>
              <button onclick="deleteSub(${sub.id}, '${sub.service_name.replace(/'/g, "\\'")}')" class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                🗑️
              </button>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div>
            <div class="text-gray-500">Monthly</div>
            <div class="font-semibold">$${monthlyAmount.toFixed(2)}</div>
          </div>
          <div>
            <div class="text-gray-500">Yearly</div>
            <div class="font-semibold">$${yearlyAmount.toFixed(2)}</div>
          </div>
          <div>
            <div class="text-gray-500">Next Bill</div>
            <div class="font-semibold">${sub.next_billing_date ? formatDate(sub.next_billing_date) : 'Unknown'}</div>
          </div>
          <div>
            <div class="text-gray-500">Last Charged</div>
            <div class="font-semibold ${isOverdue ? 'text-amber-600' : ''}">${lastCharged || 'Unknown'}</div>
          </div>
          <div>
            <div class="text-gray-500">Confidence</div>
            <div class="font-semibold ${confidenceClass}">${confidenceIcon} ${sub.charge_count || 1}x</div>
          </div>
        </div>

        ${sub.trial_expiry_date ? `
          <div class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
            <strong>⚠️ Trial ends:</strong> ${formatDate(sub.trial_expiry_date)}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function getMonthlyAmount(amount, frequency) {
  switch (frequency) {
    case 'Monthly': return amount;
    case 'Yearly': return amount / 12;
    case 'Quarterly': return amount / 3;
    case 'Weekly': return amount * 4.33;
    default: return 0;
  }
}

function getYearlyAmount(amount, frequency) {
  switch (frequency) {
    case 'Monthly': return amount * 12;
    case 'Yearly': return amount;
    case 'Quarterly': return amount * 4;
    case 'Weekly': return amount * 52;
    default: return 0;
  }
}

function handleSearch() {
  applyFilters();
}

function handleFilter() {
  applyFilters();
}

function applyFilters() {
  const searchQuery = document.getElementById('search-input').value.toLowerCase();
  const categoryFilter = document.getElementById('category-filter').value;
  const statusFilter = document.getElementById('status-filter').value;
  
  filteredSubscriptions = allSubscriptions.filter(sub => {
    const matchesSearch = !searchQuery || 
      sub.service_name.toLowerCase().includes(searchQuery) ||
      (sub.category && sub.category.toLowerCase().includes(searchQuery));
    
    const matchesCategory = !categoryFilter || sub.category === categoryFilter;
    const matchesStatus = !statusFilter || sub.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });
  
  updateSubscriptionsList();
}

async function scanNow() {
  if (!confirm('Scan Gmail inbox for NEW subscriptions (last 4 weeks)?\n\nNote: This only discovers NEW providers not already in your list.')) return;

  showLoading();
  try {
    const response = await fetch(`${API_BASE}/api/scan`, { method: 'POST' });
    const data = await response.json();

    if (data.success) {
      let msg = `✅ Scan complete!\n\nScanned: ${data.result.scanned} emails\nFound: ${data.result.found} NEW subscriptions`;
      if (data.result.skippedExisting > 0) {
        msg += `\nSkipped: ${data.result.skippedExisting} existing`;
      }
      if (data.result.skippedIgnored > 0) {
        msg += `\nIgnored: ${data.result.skippedIgnored}`;
      }
      alert(msg);
      await loadStats();
      await loadSubscriptions();
      await loadInsights();
      await loadCategoryData();
      await loadSpendingTrend();
    } else {
      alert('❌ Scan failed: ' + data.error);
    }
  } catch (error) {
    alert('❌ Error: ' + error.message);
  } finally {
    hideLoading();
  }
}

// Upload CSV file
async function uploadCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  showLoading();
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/api/import/csv`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (data.success) {
      let msg = `✅ Import complete!\n\nFound: ${data.found} subscriptions\nSaved: ${data.saved}`;
      if (data.updated > 0) {
        msg += ` (${data.updated} updated)`;
      }
      if (data.skippedIgnored > 0) {
        msg += `\nSkipped: ${data.skippedIgnored} ignored`;
      }
      alert(msg);
      await loadStats();
      await loadSubscriptions();
      await loadInsights();
      await loadCategoryData();
      await loadSpendingTrend();
    } else {
      alert('❌ Import failed: ' + data.error);
    }
  } catch (error) {
    alert('❌ Error: ' + error.message);
  } finally {
    hideLoading();
    event.target.value = ''; // Reset file input
  }
}

// Delete subscription
async function deleteSub(id, name) {
  if (!confirm(`Delete "${name}"?\n\nThis will also ignore it in future imports.`)) return;

  showLoading();
  try {
    const response = await fetch(`${API_BASE}/api/subscriptions/${id}`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (data.success) {
      await loadStats();
      await loadSubscriptions();
      await loadInsights();
      await loadCategoryData();
    } else {
      alert('❌ Delete failed: ' + data.error);
    }
  } catch (error) {
    alert('❌ Error: ' + error.message);
  } finally {
    hideLoading();
  }
}

// Edit subscription
function openEditModal(sub) {
  document.getElementById('edit-id').value = sub.id;
  document.getElementById('edit-amount').value = sub.amount;
  document.getElementById('edit-frequency').value = sub.billing_frequency;
  document.getElementById('edit-category').value = sub.category;
  document.getElementById('edit-status').value = sub.status;
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

async function saveEdit() {
  const id = document.getElementById('edit-id').value;
  const amount = parseFloat(document.getElementById('edit-amount').value);
  const billing_frequency = document.getElementById('edit-frequency').value;
  const category = document.getElementById('edit-category').value;
  const status = document.getElementById('edit-status').value;

  showLoading();
  closeEditModal();

  try {
    const response = await fetch(`${API_BASE}/api/subscriptions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, billing_frequency, category, status }),
    });

    const data = await response.json();

    if (data.success) {
      await loadStats();
      await loadSubscriptions();
      await loadInsights();
      await loadCategoryData();
    } else {
      alert('❌ Update failed: ' + data.error);
    }
  } catch (error) {
    alert('❌ Error: ' + error.message);
  } finally {
    hideLoading();
  }
}

async function exportCSV() {
  window.location.href = `${API_BASE}/api/export/csv`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return '1 month ago';
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`;
}
