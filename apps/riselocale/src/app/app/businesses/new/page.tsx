import Link from "next/link";
import BusinessSearch from "@/components/BusinessSearch";
import ManualBusiness from "./ManualBusiness";

export default function NewBusiness() {
  return (
    <div className="page">
      <Link href="/app/businesses" className="back">
        ← Businesses
      </Link>
      <h1 className="page-title">
        Add a business<span>Find it on Google so scans can match it by its listing.</span>
      </h1>
      <div className="panel panel-body">
        <BusinessSearch />
      </div>
      <details className="panel">
        <summary className="panel-body small" style={{ cursor: "pointer" }}>
          Add it by hand instead
        </summary>
        <div className="panel-body">
          <ManualBusiness />
        </div>
      </details>
    </div>
  );
}
