import socket
import struct
import time
import socket
import psutil



class DiscoverPacket:
    port: int
    ip: str

    @classmethod
    def make(cls, src_ip):
        return cls.make(src_ip)


class USRDiscoveryPacket:
    port: int = 48899
    ip: str = "192.168.2.255"

    @staticmethod
    def make(src_ip):
        # "www.usr.cn" + padding
        return b"www.usr.cn\x00" + b"\x00" * 10


class FlashForgeDiscoveryPacket:
    port: int = 19000
    ip: str = "225.0.0.9"

    @staticmethod
    def make(src_ip):
        ip_bytes = socket.inet_aton(src_ip)
        return ip_bytes + b"FR\x00\x00"


def get_lan_ips():
    ips = []
    for iface, addrs in psutil.net_if_addrs().items():
        for addr in addrs:
            if addr.family == socket.AF_INET:
                print(addr)
                ip = addr.address
                if (
                    ip.startswith("192.168.") or
                    ip.startswith("10.") or
                    ip.startswith("172.") 
                ):
                    ips.append((iface, ip))
    return ips


def discover(timeout=2.0, discovery=FlashForgeDiscoveryPacket):
    printers = []

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.settimeout(timeout)

    sock.bind(("", 0))

    for name, ip in get_lan_ips():
        pkt = discovery.make(ip)
        sock.sendto(pkt, (discovery.ip, discovery.port))

    start = time.time()
    while time.time() - start < timeout:
        try:
            data, addr = sock.recvfrom(2048)
            printers.append((addr[0], addr[1], data))
        except socket.timeout:
            break

    sock.close()
    return printers


class FlashForgeHost:
    port: int = 8899


    # Slic3r::Utils::SerialMessage controlCommand  = {"~M601 S1\r\n",Slic3r::Utils::Command};
    # Slic3r::Utils::SerialMessage connect5MCommand  = {"~M640\r\n",Slic3r::Utils::Command};
    # Slic3r::Utils::SerialMessage connectGuiderCommand  = {"~M650\r\n",Slic3r::Utils::Command};
    # Slic3r::Utils::SerialMessage statusCommand   = {"~M119\r\n",Slic3r::Utils::Command};
    # Slic3r::Utils::SerialMessage saveFileCommand = {"~M29\r\n",Slic3r::Utils::Command};

    # bool                       has_auto_discovery() const override { return false; }

    def upload(self):
        # Utils::TCPConsole client(m_host, m_console_port);

        client.enqueue_cmd(controlCommand);     # ~M601 S1
        client.enqueue_cmd(connect5MCommand);   # ~M650\r\n
        client.enqueue_cmd(statusCommand);      # ~M119\r\n

        client.enqueue_cmd(fileuploadCommand);  # "~M28 %1% 0:/user/%2%"
        Slic3r::Utils::SerialMessage dataCommand = {
            std::string(result.begin(), result.end()), Slic3r::Utils::Data
        };
        client.enqueue_cmd(dataCommand);
        client.enqueue_cmd(saveFileCommand);    # ~M29
        client.enqueue_cmd(startPrintCommand);  # ~M23 0:/user/%1%

        res = client.run_queue();


class Worker:
    def __init__(self) -> None:
        pass
    



if __name__ == "__main__":
    for p in discover(2, FlashForgeDiscoveryPacket):
        print(p)