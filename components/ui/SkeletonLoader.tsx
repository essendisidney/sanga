'use client'

export function SkeletonCard() {
  return (
    <div className="card-luxury p-6">
      <div className="skeleton h-8 w-32 mb-4" />
      <div className="skeleton h-12 w-full mb-3" />
      <div className="skeleton h-4 w-3/4" />
    </div>
  )
}

export function SkeletonTransaction() {
  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-100">
      <div className="flex items-center gap-3">
        <div className="skeleton w-10 h-10 rounded-full" />
        <div>
          <div className="skeleton h-4 w-32 mb-2" />
          <div className="skeleton h-3 w-24" />
        </div>
      </div>
      <div className="skeleton h-5 w-20" />
    </div>
  )
}

export function SkeletonDashboard() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 p-4 space-y-6">
      <div className="skeleton h-24 w-full rounded-2xl" />
      <div className="skeleton h-48 w-full rounded-2xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>
      <div className="card-luxury p-6">
        <div className="skeleton h-6 w-40 mb-4" />
        {[1, 2, 3].map((i) => (
          <SkeletonTransaction key={i} />
        ))}
      </div>
    </div>
  )
}
