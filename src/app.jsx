
import React, { Fragment } from 'react';
import Api from '@parity/api';
import { bonds, OperationsABI } from 'oo7-parity';
import { Ra, Rspan, ReactiveComponent } from 'oo7-react';
import { TransactionProgressLabel } from './TransactionProgressLabel';

import OperationsProxyABI from './abi.json';

// Todo: move elsewhere.
const filterOut = function (arr, f) {
  var matched = [];
  for (var index = 0; index < arr.length;) {
    let item = arr[index];
    if (f(item, index)) {
      arr.splice(index, 1);
      matched.push(item);
    } else {
      index++;
    }
  }
  return matched;
};

const BondReducer = function (bond, accum, init) {
  var nextItem = function (acc, rest) {
    if (rest.length === 0) {
      return acc;
    }
    let next = rest.pop();
    return accum(acc, next).map(([v, i]) => i ? v : nextItem(v, rest));
  };
  return bond.map(a => {
    let acc = typeof (init) === 'function' ? init() : typeof (init) === 'object' ? Object.assign({}, init) : init;
    let r = nextItem(acc, a);
    console.log('reduced', r, acc);
    return r;
  });
};

function trackName (t) {
  const names = {
    1: 'stable',
    2: 'beta',
    3: 'nightly',
    4: 'testing'
  };
  return names[t] || 'unknown';
}

function decodeSemver (v) {
  return [Math.floor(v / 65536), Math.floor(v / 256) % 256, v % 256];
}

class PendingApproval extends ReactiveComponent {
  constructor () {
    super(['value']);
    this.state = { current: null };
  }

  confirm () {
    let current = this.props.po.confirm(this.state.value.track, this.state.value.hash, { from: this.props.po.confirmer(this.state.value.track) });
    this.setState({
      current: current,
      checksums: this.state.value.checksums.map(r => this.props.po.confirm(r.track, r.hash, { from: this.props.po.confirmer(this.state.value.track) }))
    });
  }
  reject (f) {
    let checksums = this.state.value.checksums.map(r => this.props.po.reject(r.track, r.hash, { from: this.props.po.confirmer(this.state.value.track) }));
    this.setState({
      current: this.props.po.reject(this.state.value.track, this.state.value.hash, { from: this.props.po.confirmer(this.state.value.track) }),
      checksums: checksums
    });
  }
  render () {
    if (!this.state.value) {
      return (
        <p>Loading...</p>
      );
    }

    console.log('PEndingApproval render', this.state.value);
    let checksums = this.state.value.checksums.map((v, i) => (
      <div key={v.hash}>
        <span>{v.platform}</span> <span style={{ fontSize: 'small' }}>
          (<Rspan style={{ fontSize: 'small' }} title={v.hash}>{v.checksum}</Rspan>)
          [<RemoteChecksum platform={v.platform} semver={this.state.value.semver} checksum={v.checksum} />]
        </span>
        <span style={{ marginLeft: '1em' }}>
          <TransactionProgressLabel value={this.state.checksums ? this.state.checksums[i] : null} />
        </span>
      </div>
    ));
    return (
      <div style={{ marginBottom: '1em' }}>
        <div>
          <span style={{ fontWeight: 'bold' }}>
            <span>{this.state.value.semver.join('.')}</span>-
            <span>{trackName(this.state.value.track)}</span>
          </span>
          <span style={{ marginLeft: '2em', fontSize: 'small' }}>
            <span className='tag'>
              commit=
              <a target='top' href={`https://github.com/paritytech/parity-ethereum/tree/${this.state.value.release}`}>
                {this.state.value.release.substr(0, 7)}
              </a>
            </span>
            {
              this.state.value.critical
                ? (<span> | <span className='tag critical'>CRITICAL</span></span>)
                : ''
            }
            |
            <span className='tag'>
              fork=#{this.state.value.forkBlock}
            </span>
          </span>
        </div>

        <div style={{ marginLeft: '1em' }}>{checksums}</div>
        <a href='#' onClick={this.confirm.bind(this)}>Confirm</a>&nbsp;
        <a href='#' onClick={this.reject.bind(this)}>Reject</a>&nbsp;
        <TransactionProgressLabel value={this.state.current} />
      </div>
    );
  }
}

class PendingApprovals extends ReactiveComponent {
  constructor () {
    super(['value']);
  }

  render () {
    if (!this.state.value) {
      return (
        <p>No events found yet...</p>
      );
    }

    console.log('PendingApprovals render', this.state.value);
    return (
      <div>
        {this.state.value.map(v => (<PendingApproval key={v.hash} value={v} po={this.props.po} />))}
      </div>
    );
  }
}

export class App extends React.Component {
  constructor () {
    super();

    this.address = bonds.registry.lookupAddress('parityoperations', 'A');
    this.parityOperations = bonds.makeContract(this.address, OperationsProxyABI);

    let that = this;
    window.po = this.parityOperations;
    const ini = () => { let r = []; r.maxOld = 30; r.checksums = []; return r; };
    this.pendingRequests = BondReducer(
      this.parityOperations.NewRequestWaiting({}, { limit: 50, toBlock: 'pending' }),
      (acc, v) => {
        if (!acc.checksums) {
          acc.checksums = [];
        }
        return that.parityOperations.waiting(v.track, v.hash).map(d => {
          d = Api.util.bytesToHex(d);
          if (d === '0x') {
            acc.maxOld--;
            return [acc, acc.maxOld === 0];
          }

          // Request is current - we will need to continue iterating.
          let [name, args] = Api.util.abiUnencode(OperationsABI, d);
          if (name === 'addChecksum') {
            acc.checksums.push({
              platform: args._platform,
              track: v.track,
              hash: v.hash,
              checksum: args._checksum,
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
              checksums: filterOut(acc.checksums, c => c.release === args._release)
            };
            acc.push(o);
          }
          return [acc, false];
        });
      },
      ini
    );
  }

  render () {
    return (
      <div>
        <h1>Operations proxy</h1>
        <p>Contract address: <code><Rspan>{this.address}</Rspan></code></p>
        <PendingApprovals value={this.pendingRequests} po={this.parityOperations} />
        <h3>Checklist</h3>
        <ul>
          <li>Check if displayed keccak256 hash matches the one in the release bucket.</li>
          <li>Fetch binary and calculate the hash to confirm that CI produced it correctly.</li>
          <li>Check the binary size.</li>
        </ul>
      </div>
    );
  }
}

class RemoteChecksum extends React.Component {
  constructor (...args) {
    super(...args);

    this.githubHint = bonds.githubhint;
    window.gh = this.githubHint;
    this.state = {
      url: null
    };
  }

  componentDidMount () {
    this.componentWillReceiveProps(this.props);
  }

  componentWillReceiveProps (newProps) {
    const { platform, semver } = newProps;
    const binary = platform.indexOf('windows') !== -1 ? 'parity.exe' : 'parity';
    const url = `https://releases.parity.io/ethereum/v${semver.join('.')}/${platform}/${binary}.sha3`;

    this.setState({
      fetching: true,
      url
    });
  }

  render () {
    const { url } = this.state;
    const { checksum } = this.props;

    return (
      <Fragment>
        <a href={url}>keccak</a>
        |
        <Ra href={this.githubHint.entries(checksum).map(x => x[0])}>
          githubhint(keccak)
        </Ra>
      </Fragment>
    );
  }
}
