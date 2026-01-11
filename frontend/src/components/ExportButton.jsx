import { useState } from 'react'
import { api } from '../api/client'

export function ExportButton() {
  const [isOpen, setIsOpen] = useState(false)

  const handleExport = (format, annotatedOnly, favoritesOnly) => {
    const url = api.getExportUrl(format, annotatedOnly, favoritesOnly)
    window.open(url, '_blank')
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-secondary flex items-center gap-2"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        Export
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20">
            <div className="p-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 px-3 py-2 uppercase font-medium">
                Export Options
              </p>

              <button
                onClick={() => handleExport('json', true, false)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <p className="font-medium text-gray-900 dark:text-white">Annotated SNPs (JSON)</p>
                <p className="text-xs text-gray-500">SNPs with research data</p>
              </button>

              <button
                onClick={() => handleExport('csv', true, false)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <p className="font-medium text-gray-900 dark:text-white">Annotated SNPs (CSV)</p>
                <p className="text-xs text-gray-500">Spreadsheet format</p>
              </button>

              <button
                onClick={() => handleExport('json', false, true)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <p className="font-medium text-gray-900 dark:text-white">Favorites Only (JSON)</p>
                <p className="text-xs text-gray-500">Your starred SNPs</p>
              </button>

              <hr className="my-2 border-gray-200 dark:border-gray-700" />

              <button
                onClick={() => handleExport('json', false, false)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <p className="font-medium text-gray-900 dark:text-white">All SNPs (JSON)</p>
                <p className="text-xs text-gray-500">Warning: Large file</p>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
