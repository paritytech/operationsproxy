import React from 'react';
import {Bond, TransformBond, ReactiveBond} from 'oo7';
import {Hash, Rspan, ReactiveComponent} from 'oo7-react';
import {TransactionProgressBadge} from 'parity-reactive-ui';
import styles from "../style.css";

// Todo: move elsewhere.
Array.prototype.filterOut = function (f){
	var matched = [];
	for (var index = 0; index < this.length;) {
		let item = this[index];
		if (f(item, index)) {
			this.splice(index, 1);
			matched.push(item);
		} else {
			index++;
		}
	}
	return matched;
};

function trackName(t) {
	const names = {
		1: 'stable',
		2: 'beta',
		3: 'nightly',
		4: 'testing'
	}
	return names[t] || 'unknown';
}

function decodeSemver(v) {
	return [Math.floor(v / 65536), Math.floor(v / 256) % 256, v % 256];
}

class PendingApproval extends ReactiveComponent {
	constructor() {
		super(['value']);
		this.state = { current: null };
	}
	confirm () {
		let current = this.props.po.confirm(this.state.value.track, this.state.value.hash, {from: this.props.po.confirmer(this.state.value.track)});
		this.setState({
			current: current,
			checksums: this.state.value.checksums.map(r => this.props.po.confirm(r.track, r.hash, {from: this.props.po.confirmer(this.state.value.track)}))
		});
	}
	reject(f) {
		let checksums = this.state.value.checksums.map(r => this.props.po.reject(r.track, r.hash, {from: this.props.po.confirmer(this.state.value.track)}));
		this.setState({
			current: this.props.po.reject(this.state.value.track, this.state.value.hash, {from: this.props.po.confirmer(this.state.value.track)}),
			checksums: checksums
		});
	}
	render() {
		if (!this.state.value)
			return (<div />);
		let checksums = this.state.value.checksums.map((v, i) => (
			<div key={v.hash}>
				<span>{v.platform}</span> <span style={{fontSize: 'small'}}>(<Hash style={{fontSize: 'small'}} value={v.hash} />)</span>
				<span style={{marginLeft: '1em'}}>
					<TransactionProgressBadge value={this.state.checksums ? this.state.checksums[i] : null}/>
				</span>
			</div>
		));
		return (
			<div style={{marginBottom: '1em'}}>
				<div>
					<span style={{fontWeight: 'bold'}}>
						<span>{this.state.value.semver.join('.')}</span>-
						<span>{trackName(this.state.value.track)}</span>
					</span>
					<span style={{marginLeft: '2em', fontSize: 'small'}}>
						<span style={{padding: '0 0.5em'}}>
							commit=
							<a target='top' href={`https://github.com/ethcore/parity/tree/${this.state.value.release}`}>
								{this.state.value.release.substr(2, 7)}
							</a>
						</span>
						{this.state.value.critical ? (<span> | <span style={{padding: '0 0.5em'}}>CRITICAL</span></span>) : ''}
						|
						<span style={{padding: '0 0.5em'}}>
							fork=#{this.state.value.forkBlock}
						</span>
					</span>
				</div>

				<div style={{marginLeft: '1em'}}>{checksums}</div>
				<a href='#' onClick={this.confirm.bind(this)}>Confirm</a>&nbsp;
				<a href='#' onClick={this.reject.bind(this)}>Reject</a>&nbsp;
				<TransactionProgressBadge value={this.state.current}/>
			</div>
		);
	}
}

class PendingApprovals extends ReactiveComponent {
	constructor() {
		super(['value']);
	}
	render() {
		if (!this.state.value)
			return (<div>No value given yet</div>);
		return (<div>{
			this.state.value.map(v => <PendingApproval key={v.hash} value={v} po={this.props.po} />)
		}</div>);
	}
}

export class App extends React.Component {
	constructor() {
		super();

		this.parityOperations = parity.bonds.makeContract(parity.bonds.registry.lookupAddress('parityoperations', 'A'), OperationsProxyABI);
		let ini = [];
		ini.checksums = [];
		this.pendingRequests = this.parityOperations.NewRequestWaiting({}, {toBlock: 'pending'}).reduce((acc, v) =>
			this.parityOperations.waiting(v.track, v.hash).map(d => {
				d = parity.api.util.bytesToHex(d);
				if (d === '0x') {
					return [acc, !acc.checksums.length];
				}

				// Request is current - we will need to continue iterating.
				let [name, args] = parity.api.util.abiUnencode(parity.api.abi.operations, d);
				if (name === 'addChecksum') {
					acc.checksums.push({
						platform: args._platform,
						hash: args._checksum,
						track: v.track,
						hash: v.hash,
						release: args._release
					});
				} else {
					let o = {
						track: v.track,
						hash: v.hash,
						release: args._release.substr(26),
						forkBlock: args._forkBlock,
						critical: args._critical,
						semver: decodeSemver(args._semver),
						checksums: acc.checksums.filterOut(c => c.release == args._release)
					};
					acc.push(o);
				}

				return [acc, false];
			}),
		ini);
	}
	render() {
		return (
			<div>
				<PendingApprovals value={this.pendingRequests} po={this.parityOperations}/>
			</div>
		);
	}
}

const OperationsProxyABI = [
  {
    "constant": true,
    "inputs": [
      {
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "trackOfPendingRelease",
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "payable": false,
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "name": "_owner",
        "type": "address"
      }
    ],
    "name": "setOwner",
    "outputs": [],
    "payable": false,
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "name": "_confirmer",
        "type": "address"
      },
      {
        "name": "_track",
        "type": "uint8"
      }
    ],
    "name": "setConfirmer",
    "outputs": [],
    "payable": false,
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "name": "_release",
        "type": "bytes32"
      }
    ],
    "name": "cleanupRelease",
    "outputs": [],
    "payable": false,
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [],
    "name": "kill",
    "outputs": [],
    "payable": false,
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "name": "",
        "type": "uint8"
      },
      {
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "waiting",
    "outputs": [
      {
        "name": "",
        "type": "bytes"
      }
    ],
    "payable": false,
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "name": "_release",
        "type": "bytes32"
      },
      {
        "name": "_platform",
        "type": "bytes32"
      },
      {
        "name": "_checksum",
        "type": "bytes32"
      }
    ],
    "name": "addChecksum",
    "outputs": [],
    "payable": false,
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "name": "delegate",
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "payable": false,
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "name": "_delegate",
        "type": "address"
      },
      {
        "name": "_track",
        "type": "uint8"
      }
    ],
    "name": "setDelegate",
    "outputs": [],
    "payable": false,
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "operations",
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "payable": false,
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "payable": false,
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "name": "_release",
        "type": "bytes32"
      },
      {
        "name": "_forkBlock",
        "type": "uint32"
      },
      {
        "name": "_track",
        "type": "uint8"
      },
      {
        "name": "_semver",
        "type": "uint24"
      },
      {
        "name": "_critical",
        "type": "bool"
      }
    ],
    "name": "addRelease",
    "outputs": [],
    "payable": false,
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "name": "_to",
        "type": "address"
      },
      {
        "name": "_value",
        "type": "uint256"
      },
      {
        "name": "_data",
        "type": "bytes"
      }
    ],
    "name": "send",
    "outputs": [],
    "payable": true,
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "name": "_track",
        "type": "uint8"
      },
      {
        "name": "_hash",
        "type": "bytes32"
      }
    ],
    "name": "confirm",
    "outputs": [],
    "payable": true,
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "name": "_track",
        "type": "uint8"
      },
      {
        "name": "_hash",
        "type": "bytes32"
      }
    ],
    "name": "reject",
    "outputs": [],
    "payable": false,
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "name": "confirmer",
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "payable": false,
    "type": "function"
  },
  {
    "inputs": [
      {
        "name": "_owner",
        "type": "address"
      },
      {
        "name": "_stable",
        "type": "address"
      },
      {
        "name": "_beta",
        "type": "address"
      },
      {
        "name": "_nightly",
        "type": "address"
      },
      {
        "name": "_stableConfirmer",
        "type": "address"
      },
      {
        "name": "_betaConfirmer",
        "type": "address"
      },
      {
        "name": "_nightlyConfirmer",
        "type": "address"
      },
      {
        "name": "_operations",
        "type": "address"
      }
    ],
    "payable": false,
    "type": "constructor"
  },
  {
    "payable": false,
    "type": "fallback"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "name": "to",
        "type": "address"
      },
      {
        "indexed": false,
        "name": "value",
        "type": "uint256"
      },
      {
        "indexed": false,
        "name": "data",
        "type": "bytes"
      }
    ],
    "name": "Sent",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "name": "was",
        "type": "address"
      },
      {
        "indexed": true,
        "name": "who",
        "type": "address"
      }
    ],
    "name": "OwnerChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "name": "was",
        "type": "address"
      },
      {
        "indexed": true,
        "name": "who",
        "type": "address"
      },
      {
        "indexed": true,
        "name": "track",
        "type": "uint8"
      }
    ],
    "name": "DelegateChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "name": "was",
        "type": "address"
      },
      {
        "indexed": true,
        "name": "who",
        "type": "address"
      },
      {
        "indexed": true,
        "name": "track",
        "type": "uint8"
      }
    ],
    "name": "ConfirmerChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "name": "track",
        "type": "uint8"
      },
      {
        "indexed": true,
        "name": "release",
        "type": "bytes32"
      }
    ],
    "name": "AddReleaseRelayed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "name": "release",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "name": "_platform",
        "type": "bytes32"
      }
    ],
    "name": "AddChecksumRelayed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "name": "track",
        "type": "uint8"
      },
      {
        "indexed": false,
        "name": "hash",
        "type": "bytes32"
      }
    ],
    "name": "NewRequestWaiting",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "name": "track",
        "type": "uint8"
      },
      {
        "indexed": false,
        "name": "hash",
        "type": "bytes32"
      }
    ],
    "name": "RequestConfirmed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "name": "track",
        "type": "uint8"
      },
      {
        "indexed": false,
        "name": "hash",
        "type": "bytes32"
      }
    ],
    "name": "RequestRejected",
    "type": "event"
  }
];
