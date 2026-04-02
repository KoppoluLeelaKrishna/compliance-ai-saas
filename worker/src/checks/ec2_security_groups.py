import boto3
from botocore.exceptions import ClientError


def _safe(call, default=None):
    try:
        return call()
    except ClientError as e:
        return {"_error": e.response["Error"]["Code"], "_message": str(e)}


def scan_ec2_security_groups(region: str = "us-east-1") -> list[dict]:
    """
    Flags Security Groups that allow inbound 0.0.0.0/0 (or ::/0) on risky ports.
    Risky ports: 22 (SSH), 3389 (RDP), and "ALL TRAFFIC" (-1).
    """
    ec2 = boto3.client("ec2", region_name=region)
    findings: list[dict] = []

    resp = _safe(lambda: ec2.describe_security_groups(), default={})
    if isinstance(resp, dict) and resp.get("_error"):
        return findings

    groups = resp.get("SecurityGroups", []) if isinstance(resp, dict) else []

    risky_ports = {22, 3389}

    for sg in groups:
        sg_id = sg.get("GroupId", "")
        sg_name = sg.get("GroupName", "")
        vpc_id = sg.get("VpcId", "")
        perms = sg.get("IpPermissions", []) or []

        for p in perms:
            ip_proto = p.get("IpProtocol")  # "tcp", "udp", "-1"
            from_port = p.get("FromPort")
            to_port = p.get("ToPort")

            ipv4_ranges = p.get("IpRanges", []) or []
            ipv6_ranges = p.get("Ipv6Ranges", []) or []

            has_world_v4 = any(r.get("CidrIp") == "0.0.0.0/0" for r in ipv4_ranges)
            has_world_v6 = any(r.get("CidrIpv6") == "::/0" for r in ipv6_ranges)
            if not (has_world_v4 or has_world_v6):
                continue

            # Case 1: All traffic open to world
            if ip_proto == "-1":
                findings.append(
                    {
                        "service": "EC2",
                        "title": "Security Group allows ALL traffic from the internet",
                        "check_id": "EC2_SG_ALL_TRAFFIC_OPEN",
                        "severity": "CRITICAL",
                        "resource_id": f"ec2://sg/{sg_id}",
                        "status": "FAIL",
                        "evidence": {
                            "group_id": sg_id,
                            "group_name": sg_name,
                            "vpc_id": vpc_id,
                            "ip_protocol": ip_proto,
                            "from_port": from_port,
                            "to_port": to_port,
                            "world_ipv4": has_world_v4,
                            "world_ipv6": has_world_v6,
                            "ip_permissions": p,
                        },
                    }
                )
                continue

            # If ports missing, skip
            if from_port is None or to_port is None:
                continue

            # Case 2: SSH/RDP open to world
            opened_ports = set(range(int(from_port), int(to_port) + 1))
            bad_ports = sorted(list(opened_ports.intersection(risky_ports)))
            if bad_ports:
                findings.append(
                    {
                        "service": "EC2",
                        "title": "Security Group allows SSH/RDP from the internet",
                        "check_id": "EC2_SG_SSH_RDP_OPEN",
                        "severity": "CRITICAL",
                        "resource_id": f"ec2://sg/{sg_id}",
                        "status": "FAIL",
                        "evidence": {
                            "group_id": sg_id,
                            "group_name": sg_name,
                            "vpc_id": vpc_id,
                            "ip_protocol": ip_proto,
                            "from_port": from_port,
                            "to_port": to_port,
                            "bad_ports": bad_ports,
                            "world_ipv4": has_world_v4,
                            "world_ipv6": has_world_v6,
                            "ip_permissions": p,
                        },
                    }
                )

    return findings


# ✅ runner.py expects this exact name
def run_check(region: str = "us-east-1") -> list[dict]:
    return scan_ec2_security_groups(region=region)