import { Chart } from "@gd/components/Chart";
import { DashboardRecentFileRow } from "@gd/components/DashboardRecentFileRow";
import { DashboardSummaryCard } from "@gd/components/DashboardSummaryCard";
import { getDriveFiles, getDriveTotalSpaceUsed, getDriveStarredSummary } from "@gd/lib/actions/drive.actions";
import { getUsageSummary } from "@gd/lib/utils";
import type { DriveFileDisplay } from "@gd/lib/google-drive";
import { DRIVE_DASHBOARD_SUBTITLE } from "@gd/constants/page-headings";
const Dashboard = async () => {
    const [filesRes, totalSpace, starredSummary] = await Promise.all([
        getDriveFiles({ types: [], limit: 10 }),
        getDriveTotalSpaceUsed(),
        getDriveStarredSummary(),
    ]);
    const files = filesRes ?? { documents: [], total: 0 };
    const totalSpaceSafe = totalSpace ?? {
        used: 0,
        all: 2 * 1024 * 1024 * 1024,
        document: { size: 0, latestDate: "" },
        image: { size: 0, latestDate: "" },
        video: { size: 0, latestDate: "" },
        audio: { size: 0, latestDate: "" },
        other: { size: 0, latestDate: "" },
    };
    const usageSummary = getUsageSummary(totalSpaceSafe, starredSummary ?? undefined);
    return (<div className="dashboard-container">
      <div className="col-span-full mb-2 md:mb-0">
        <h1 className="h1 text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-4xl">
          Dashboard
        </h1>
        <p className="page-lead !mt-2">{DRIVE_DASHBOARD_SUBTITLE}</p>
      </div>
      <section>
        <Chart used={totalSpaceSafe.used} limit={totalSpaceSafe.all}/>

        
        <ul className="dashboard-summary-list m-0 list-none p-0">
          {usageSummary.map((summary) => (<DashboardSummaryCard key={summary.title} summary={summary}/>))}
        </ul>
      </section>

      
      <section className="dashboard-recent-files">
        <h2 className="text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50 xl:text-xl">
          Recent files
        </h2>
        {files.documents.length > 0 ? (<ul className="mt-5 flex flex-col gap-5">
            {files.documents.map((file: DriveFileDisplay) => (<li key={file.$id}>
                <DashboardRecentFileRow file={file}/>
              </li>))}
          </ul>) : (<p className="empty-list">No files in Drive</p>)}
      </section>
    </div>);
};
export default Dashboard;
