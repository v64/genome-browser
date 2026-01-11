// Badge component for displaying genotype labels (normal, abnormal, rare, etc.)

const labelConfig = {
  normal: {
    bg: 'bg-green-100 dark:bg-green-900/50',
    text: 'text-green-700 dark:text-green-300',
    icon: null,
  },
  abnormal: {
    bg: 'bg-orange-100 dark:bg-orange-900/50',
    text: 'text-orange-700 dark:text-orange-300',
    icon: '!',
  },
  rare: {
    bg: 'bg-purple-100 dark:bg-purple-900/50',
    text: 'text-purple-700 dark:text-purple-300',
    icon: '*',
  },
  protective: {
    bg: 'bg-blue-100 dark:bg-blue-900/50',
    text: 'text-blue-700 dark:text-blue-300',
    icon: '+',
  },
  risk: {
    bg: 'bg-red-100 dark:bg-red-900/50',
    text: 'text-red-700 dark:text-red-300',
    icon: '!',
  },
  carrier: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/50',
    text: 'text-yellow-700 dark:text-yellow-300',
    icon: '~',
  },
  neutral: {
    bg: 'bg-gray-100 dark:bg-gray-700',
    text: 'text-gray-600 dark:text-gray-400',
    icon: null,
  },
};

export function LabelBadge({ label, size = 'sm', showIcon = true, onClick }) {
  if (!label) return null;

  const config = labelConfig[label.toLowerCase()] || labelConfig.neutral;

  const sizeClasses = {
    xs: 'px-1 py-0.5 text-xs',
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
  };

  const Component = onClick ? 'button' : 'span';

  return (
    <Component
      onClick={onClick}
      className={`inline-flex items-center gap-0.5 rounded-full font-medium capitalize ${config.bg} ${config.text} ${sizeClasses[size]} ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      title={`Genotype classification: ${label}`}
    >
      {showIcon && config.icon && <span className="font-bold">{config.icon}</span>}
      {label}
    </Component>
  );
}

export function LabelFilter({ labels, selectedLabel, onSelect }) {
  if (!labels || labels.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          !selectedLabel
            ? 'bg-purple-600 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        All
      </button>
      {labels.map(({ label, count }) => {
        const config = labelConfig[label.toLowerCase()] || labelConfig.neutral;
        const isSelected = selectedLabel === label;
        return (
          <button
            key={label}
            onClick={() => onSelect(label)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              isSelected
                ? `${config.bg} ${config.text} ring-2 ring-offset-2 ring-purple-500 dark:ring-offset-gray-900`
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <span className="capitalize">{label}</span>
            <span className={`text-xs ${isSelected ? 'opacity-80' : 'text-gray-400 dark:text-gray-500'}`}>
              ({count})
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default LabelBadge;
