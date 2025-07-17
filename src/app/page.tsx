import Link from 'next/link';

export default function Home() {
  const webhookTypes = [
    {
      type: 'issue',
      description: 'Handle Linear issue events (create, update, remove)',
    },
    { type: 'comment', description: 'Handle Linear comment events' },
    { type: 'project', description: 'Handle Linear project events' },
    { type: 'team', description: 'Handle Linear team events' },
    { type: 'user', description: 'Handle Linear user events' },
  ];

  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8'>
      <div className='max-w-4xl mx-auto'>
        <div className='text-center mb-12'>
          <h1 className='text-4xl font-bold text-gray-900 mb-4'>
            Linear Webhook Connector
          </h1>
          <p className='text-xl text-gray-600'>
            Ready to receive Linear webhook events and process ticket updates
          </p>
        </div>

        <div className='bg-white rounded-lg shadow-lg p-8 mb-8'>
          <h2 className='text-2xl font-semibold text-gray-900 mb-6'>
            Available Webhook Endpoints
          </h2>

          <div className='space-y-4'>
            {webhookTypes.map(({ type, description }) => (
              <div key={type} className='border border-gray-200 rounded-lg p-4'>
                <div className='flex items-center justify-between'>
                  <div>
                    <h3 className='text-lg font-medium text-gray-900'>
                      /api/linear-webhook/{type}
                    </h3>
                    <p className='text-gray-600 mt-1'>{description}</p>
                  </div>
                  <Link
                    href={`/api/linear-webhook/${type}`}
                    className='inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-indigo-600 bg-indigo-100 hover:bg-indigo-200 transition-colors'
                  >
                    Test Endpoint
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className='bg-white rounded-lg shadow-lg p-8'>
          <h2 className='text-2xl font-semibold text-gray-900 mb-6'>
            Setup Instructions
          </h2>

          <div className='space-y-6'>
            <div>
              <h3 className='text-lg font-medium text-gray-900 mb-2'>
                1. Configure Linear Webhooks
              </h3>
              <p className='text-gray-600'>
                In your Linear workspace, go to Settings → API → Webhooks and
                create a new webhook pointing to:{' '}
                <code className='bg-gray-100 px-2 py-1 rounded text-sm'>
                  https://your-domain.vercel.app/api/linear-webhook/issue
                </code>
              </p>
            </div>

            <div>
              <h3 className='text-lg font-medium text-gray-900 mb-2'>
                2. Environment Variables
              </h3>
              <p className='text-gray-600 mb-2'>
                Set the following environment variable for webhook signature
                verification:
              </p>
              <div className='bg-gray-100 p-3 rounded-md'>
                <code className='text-sm'>
                  LINEAR_WEBHOOK_SECRET=your_secret_here
                </code>
              </div>
            </div>

            <div>
              <h3 className='text-lg font-medium text-gray-900 mb-2'>
                3. Supported Events
              </h3>
              <ul className='text-gray-600 space-y-1'>
                <li>• Issue creation, updates, and removal</li>
                <li>• Comment events</li>
                <li>• Project changes</li>
                <li>• Webhook signature verification</li>
                <li>• Comprehensive error handling and logging</li>
              </ul>
            </div>
          </div>
        </div>

        <div className='text-center mt-8'>
          <p className='text-gray-500'>
            Built with Next.js 14 • Ready for Vercel deployment
          </p>
        </div>
      </div>
    </div>
  );
}
